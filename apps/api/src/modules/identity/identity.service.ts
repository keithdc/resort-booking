/**
 * @file apps/api/src/modules/identity/identity.service.ts
 * @feature identity
 * @dependencies DatabaseService
 */

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChangeStaffPasswordRequest,
  Organization,
  OrganizationSettings,
  StaffSessionInfo,
  TwoFactorChallenge,
  UpdateOrganizationSettingsRequest,
  UpdateStaffProfileRequest,
} from '@resort-booking/shared-types';
import { isDevelopment, isProduction } from '../../shared/config/environment';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditMetadata } from '../../shared/audit/audit.types';
import { fingerprint } from '../../shared/http/client-ip';
import type { StaffAccount, StaffSessionResult } from '../../shared/roles/staff-role';
import { DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD } from './identity.defaults';
import {
  createSessionToken,
  dummyPasswordHash,
  hashPassword,
  hashSessionToken,
  passwordNeedsRehash,
  verifyPassword,
} from './identity.password';
import { validatePassword } from '../../shared/validation/password-policy';
import { PasswordTooWeakException } from '../../shared/validation/password-too-weak.exception';
import { deviceLabelFromUserAgent } from './identity.device-label';
import { IdentityRepository, NO_DEVICE, type SessionDevice } from './identity.repository';
import { resolveSessionPolicy, type SessionPolicy } from './identity.session-policy';
import { diffOrganizationSettings, settingsAuditMetadata } from './organization-settings-diff';
import { LoginLimiter } from './login-limiter';
import { TwoFactorService } from './two-factor.service';

/** A session's last-used time is refreshed at most this often (one write a minute per session, not one per request). */
const TOUCH_EVERY_MS = 60 * 1000;

/** Where a sign-in attempt came from, for the limiter and the auth log. */
export interface LoginContext {
  ip: string | undefined;
  requestId: string | undefined;
  /** The browser's User-Agent: only a coarse device label is kept from it. */
  userAgent?: string | undefined;
}

/** What a new session records about where it was opened. */
export type SessionOrigin = Pick<LoginContext, 'ip' | 'userAgent'>;

@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger('Auth');
  private readonly policy: SessionPolicy;

  public constructor(
    private readonly identity: IdentityRepository,
    private readonly config: ConfigService,
    private readonly limiter: LoginLimiter,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {
    this.policy = resolveSessionPolicy((name: string): string | undefined => this.config.get<string>(name));
  }

  public async onModuleInit(): Promise<void> {
    await this.ensureOwnerAccount();
    await this.checkDefaultOwnerCredentials();
  }

  public async getOrganization(): Promise<Organization | null> {
    const settings = await this.identity.getSettings();
    if (settings === null) {
      return null;
    }
    return { id: settings.id, name: settings.name };
  }

  public async getSettings(organizationId: string): Promise<OrganizationSettings> {
    const settings = await this.identity.getSettings(organizationId);
    if (settings === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    return settings;
  }

  /**
   * Saves the settings and works out what REALLY changed: the audit row names the changed fields (never values) and
   * carries the bank-details signal, instead of the 12 field names every save sends (docs/13 R2-06).
   */
  public async updateSettings(
    input: UpdateOrganizationSettingsRequest,
    organizationId: string,
  ): Promise<{ settings: OrganizationSettings; audit: AuditMetadata }> {
    const current = await this.getSettings(organizationId);
    const change = diffOrganizationSettings(current, input);
    const saved = await this.identity.updateSettings(current.id, input);
    if (saved === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    if (change.sensitiveFields.length > 0) {
      // Same line a log alert can match on, with no value in it.
      this.logger.warn(`org.settings_changed sensitive fields: ${change.sensitiveFields.join(',')} (organization ${organizationId})`);
    }
    return { settings: saved, audit: settingsAuditMetadata(change) };
  }

  /**
   * Email + password. Order matters: the limiter is asked BEFORE any password work, every attempt costs one
   * password verification (a dummy hash stands in for an unknown email, so timing reveals nothing), and one
   * message covers both "no such account" and "wrong password".
   *
   * A person with two-factor on gets a short-lived challenge INSTEAD of a session (see completeTwoFactorLogin);
   * everybody else gets exactly the session they always got.
   */
  public async login(
    email: string,
    password: string,
    context: LoginContext = { ip: undefined, requestId: undefined },
  ): Promise<StaffSessionResult | TwoFactorChallenge> {
    const address = email.trim().toLowerCase();
    const who = this.describe(address, context);
    try {
      await this.limiter.assertAllowed(address, context.ip);
    } catch (error: unknown) {
      this.logger.warn(`login.blocked ${who}`);
      throw error;
    }

    const staff = await this.identity.findStaffByEmail(address);
    // The network key keeps one source from filling the shared hashing queue (docs/13 R2-18).
    const matches = await verifyPassword(password, staff === null ? await dummyPasswordHash() : staff.passwordHash, context.ip);
    // A switched-off account fails exactly like a wrong password: nothing tells the caller it exists.
    if (staff === null || !matches || !staff.active) {
      await this.limiter.recordFailure(address, context.ip);
      this.logger.warn(`login.failed ${who}`);
      await this.audit.record({
        organizationId: staff?.organizationId ?? null,
        staffUserId: staff?.id ?? null,
        action: 'auth.login_failed',
        metadata: { emailHash: this.audit.hashEmail(address).slice(0, 16) },
        ipHash: context.ip === undefined ? null : this.audit.hashIp(context.ip),
        requestId: context.requestId ?? null,
      });
      throw new UnauthorizedException({ message: 'Email or password is wrong', code: 'STAFF_LOGIN_FAILED' });
    }

    await this.limiter.recordSuccess(address);
    await this.upgradePasswordHash(staff.id, staff.passwordHash, password);
    if (await this.twoFactor.isEnabled(staff.id)) {
      this.logger.log(`login.second_factor_required staff=${staff.id} ${who}`);
      return this.twoFactor.createChallenge(staff.id);
    }
    return this.finishLogin(staff, context, who, false);
  }

  /**
   * Second login step: a challenge token from `login` plus an authenticator or recovery code. Opens the normal
   * session. Wrong codes are limited and burn the challenge (see TwoFactorService.completeChallenge).
   */
  public async completeTwoFactorLogin(
    challengeToken: string,
    code: string,
    context: LoginContext = { ip: undefined, requestId: undefined },
  ): Promise<StaffSessionResult> {
    const passed = await this.twoFactor.completeChallenge(challengeToken, code, context);
    const staff = await this.identity.findStaffById(passed.staffUserId);
    if (staff === null || !staff.active) {
      throw new UnauthorizedException({ message: 'This sign-in has expired. Start again.', code: 'TWO_FACTOR_CHALLENGE_INVALID' });
    }
    return this.finishLogin(staff, context, this.describe(staff.email, context), true);
  }

  /** Opens the session and writes the success to the logs; shared by both ways of signing in. */
  private async finishLogin(staff: StaffAccount, context: LoginContext, who: string, secondFactor: boolean): Promise<StaffSessionResult> {
    const session = await this.startSession(staff, context);
    await this.identity.touchLastLogin(staff.id);
    this.logger.log(`login.success staff=${staff.id} ${who}`);
    await this.audit.record({
      organizationId: staff.organizationId,
      staffUserId: staff.id,
      action: 'auth.login',
      ...(secondFactor ? { metadata: { twoFactor: true } } : {}),
      ipHash: context.ip === undefined ? null : this.audit.hashIp(context.ip),
      requestId: context.requestId ?? null,
    });
    return session;
  }

  /**
   * Opens a session for an account that has just proved who it is (signing in, registering, accepting an
   * invitation). The token is returned once; only its hash is stored.
   */
  public async startSession(staff: StaffAccount, origin?: SessionOrigin): Promise<StaffSessionResult> {
    const token = createSessionToken();
    const lifetime = staff.role === 'admin' ? this.policy.adminMaxMs : this.policy.employeeMaxMs;
    const expiresAt = new Date(Date.now() + lifetime);
    await this.identity.createSession(staff.id, hashSessionToken(token), expiresAt, this.deviceOf(origin));
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      staff: {
        id: staff.id,
        organizationId: staff.organizationId,
        fullName: staff.fullName,
        email: staff.email,
        role: staff.role,
        organizationName: staff.organizationName,
        canManageRefunds: staff.canManageRefunds,
      },
    };
  }

  /** The coarse label and the salted IP hash for a new session (never the raw User-Agent or IP). */
  private deviceOf(origin: SessionOrigin | undefined): SessionDevice {
    if (origin === undefined) {
      return NO_DEVICE;
    }
    return {
      label: deviceLabelFromUserAgent(origin.userAgent),
      ipHash: origin.ip === undefined ? null : this.audit.hashIp(origin.ip),
    };
  }

  public async logout(token: string): Promise<void> {
    await this.identity.deleteSessionByTokenHash(hashSessionToken(token));
  }

  /**
   * The person behind a session token, or null. Sessions are the ONLY way in: the token is looked up by its
   * hash and must not be expired.
   */
  public async staffFromToken(token: string): Promise<StaffAccount | null> {
    const live = await this.identity.findLiveSession(hashSessionToken(token), this.policy.idleMs / 1000);
    if (live === null) {
      return null;
    }
    // Keeps the idle clock honest without a write per request. A failed write never refuses a valid session.
    if (Date.now() - live.lastUsedAt.getTime() >= TOUCH_EVERY_MS) {
      await this.identity.touchSession(live.sessionId).catch((error: unknown): void => {
        this.logger.warn(`session.touch_failed ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }
    return live.staff;
  }

  /** The person's own live sessions (never anyone else's), the calling one flagged `current`. */
  public listSessions(staffId: string, currentToken: string): Promise<StaffSessionInfo[]> {
    return this.identity.listSessions(staffId, hashSessionToken(currentToken), this.policy.idleMs / 1000);
  }

  /** Signs ONE of the person's own sessions out. Another person's id (or an unknown one) is "not found". */
  public async revokeSession(staffId: string, sessionId: string): Promise<void> {
    if (!(await this.identity.deleteOwnSession(staffId, sessionId))) {
      throw new NotFoundException({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
    }
    this.logger.log(`session.revoked staff=${staffId}`);
  }

  /** Signs the person out everywhere except the session making the request. */
  public async revokeOtherSessions(staffId: string, currentToken: string): Promise<number> {
    const removed = await this.identity.deleteSessionsExcept(staffId, hashSessionToken(currentToken));
    this.logger.log(`session.revoked_others staff=${staffId} count=${String(removed)}`);
    return removed;
  }

  /**
   * Signs the person out of every device, this one included.
   */
  public async logoutAll(staffId: string): Promise<number> {
    const removed = await this.identity.deleteSessionsExcept(staffId, null);
    this.logger.log(`logout.all staff=${staffId} sessions=${String(removed)}`);
    return removed;
  }

  /**
   * Admin reset of a member's two-factor (lost phone): removes it and ends their sessions. The organization is
   * checked in SQL; a member of another workspace is "not found".
   */
  public async resetTwoFactor(organizationId: string, staffUserId: string): Promise<{ hadTwoFactor: boolean }> {
    const outcome = await this.twoFactor.resetForMember(organizationId, staffUserId);
    await this.logoutAll(staffUserId);
    return outcome;
  }

  /**
   * Removes expired sessions (called hourly).
   */
  public purgeExpiredSessions(): Promise<number> {
    return this.identity.purgeExpiredSessions(this.policy.idleMs / 1000);
  }

  /**
   * Saves name and sign-in email. When the EMAIL changes, every other session of the person is signed out (docs/13 R2-17:
   * a stolen session must not keep working after the address that resets the password was swapped). `session` is the
   * caller's current email and token: the token's session stays signed in.
   */
  public async updateProfile(
    staffId: string,
    input: UpdateStaffProfileRequest,
    session?: { currentEmail: string; token: string },
  ): Promise<StaffAccount> {
    const email = input.email.trim().toLowerCase();
    if (email === '' || input.fullName.trim() === '') {
      throw new BadRequestException({ message: 'Name and email are required', code: 'STAFF_PROFILE_INVALID' });
    }
    let saved: StaffAccount | null;
    try {
      saved = await this.identity.updateStaffProfile(staffId, input.fullName.trim(), email);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({ message: 'Another account already uses this email', code: 'EMAIL_TAKEN' });
      }
      throw error;
    }
    if (saved === null) {
      throw new NotFoundException({ message: 'Staff not found', code: 'STAFF_NOT_FOUND' });
    }
    if (session !== undefined && session.token !== '' && session.currentEmail.trim().toLowerCase() !== email) {
      const removed = await this.identity.deleteSessionsExcept(staffId, hashSessionToken(session.token));
      this.logger.log(`email.changed staff=${staffId} otherSessionsRevoked=${String(removed)}`);
    }
    return saved;
  }

  /**
   * Changes the password and signs the person out everywhere else (a stolen session must not survive it).
   * `currentToken` is the session making the change; it stays signed in.
   */
  public async changePassword(staffId: string, input: ChangeStaffPasswordRequest, currentToken?: string): Promise<void> {
    const staff = await this.identity.findStaffById(staffId);
    if (staff === null) {
      throw new NotFoundException({ message: 'Staff not found', code: 'STAFF_NOT_FOUND' });
    }
    this.assertPasswordAcceptable(input.newPassword, staff.email);
    if (!(await verifyPassword(input.currentPassword, staff.passwordHash))) {
      throw new UnauthorizedException({ message: 'Current password is wrong', code: 'STAFF_PASSWORD_MISMATCH' });
    }
    await this.identity.updateStaffPassword(staffId, await hashPassword(input.newPassword));
    const removed = await this.identity.deleteSessionsExcept(
      staffId,
      currentToken === undefined || currentToken === '' ? null : hashSessionToken(currentToken),
    );
    this.logger.log(`password.changed staff=${staffId} otherSessionsRevoked=${String(removed)}`);
  }

  /**
   * The one place a staff password is checked against the policy before it is stored. Registration, invitations
   * and password resets must call this too, never their own rules. Throws 400 PASSWORD_TOO_WEAK with the
   * list of problems. `email` is the account's sign-in email (a password may not be built from its first part).
   */
  public assertPasswordAcceptable(password: string, email: string): void {
    const verdict = validatePassword(password, { email });
    if (!verdict.ok) {
      throw new PasswordTooWeakException(verdict.problems);
    }
  }

  /**
   * First boot only: creates the owner from STAFF_OWNER_EMAIL and STAFF_OWNER_PASSWORD. There is no fallback
   * password, so a server cannot come up with a login everyone knows by forgetting to set one.
   */
  private async ensureOwnerAccount(): Promise<void> {
    if ((await this.identity.countStaffUsers()) > 0) {
      return;
    }
    const settings = await this.identity.getSettings();
    if (settings === null) {
      return;
    }
    const email = this.config.get<string>('STAFF_OWNER_EMAIL')?.trim().toLowerCase() ?? '';
    const password = this.config.get<string>('STAFF_OWNER_PASSWORD') ?? '';
    if (email === '' || password === '') {
      throw new Error(
        'There is no staff account yet. Set STAFF_OWNER_EMAIL and STAFF_OWNER_PASSWORD (see apps/api/.env.example) for the first start.',
      );
    }
    const verdict = validatePassword(password, { email });
    if (!verdict.ok) {
      const message = `STAFF_OWNER_PASSWORD does not meet the password policy: ${verdict.problems.join('; ')}.`;
      if (!isDevelopment(process.env)) {
        throw new Error(`${message} Choose a stronger one (see apps/api/.env.example).`);
      }
      // A developer's machine may keep the documented dev login; everywhere else this refuses to start.
      this.logger.warn(`${message} Allowed only because NODE_ENV=development.`);
    }
    const name = settings.ownerName === '' ? settings.name : settings.ownerName;
    await this.identity.insertStaffUser(settings.id, name, email, await hashPassword(password));
  }

  /**
   * The documented development login must not survive into production. In production an account that still
   * accepts it stops the boot; elsewhere it is a logged warning. The password is checked, never logged.
   */
  private async checkDefaultOwnerCredentials(): Promise<void> {
    const owner = await this.identity.findStaffByEmail(DEV_OWNER_EMAIL);
    if (owner === null || !(await verifyPassword(DEV_OWNER_PASSWORD, owner.passwordHash))) {
      return;
    }
    const message = `The staff account ${DEV_OWNER_EMAIL} still uses the documented development password. Change it (Account > Password) or remove the account.`;
    if (isProduction(process.env)) {
      throw new Error(`Refusing to start: ${message}`);
    }
    this.logger.warn(message);
  }

  /**
   * A correct password is the only moment its plain text is at hand: an old-format or low-cost hash is replaced by one
   * at the current cost (docs/13 R2-27). Never fails the sign-in; the next one tries again.
   */
  private async upgradePasswordHash(staffId: string, stored: string, password: string): Promise<void> {
    if (!passwordNeedsRehash(stored)) {
      return;
    }
    try {
      await this.identity.updateStaffPassword(staffId, await hashPassword(password));
    } catch {
      this.logger.warn(`password.rehash_failed staff=${staffId}`);
    }
  }

  /**
   * Who is asking, for the auth log: never the email, the password or the IP, only short salted hashes of the email
   * and of the normalised network (an IPv6 address is first cut to its /64, see `clientIp`), plus the request id.
   */
  private describe(email: string, context: LoginContext): string {
    // Startup already refuses a production run without the salt, so reading it plainly here cannot log unsalted hashes there.
    const salt = this.config.get<string>('IP_HASH_SALT')?.trim() ?? '';
    const network = context.ip === undefined ? 'unknown' : `#${fingerprint(context.ip, salt).slice(0, 12)}`;
    return `email#${fingerprint(email, salt).slice(0, 12)} ip${network} req=${context.requestId ?? 'none'}`;
  }
}

/** Postgres "unique_violation": the email already belongs to another account. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === '23505';
}
