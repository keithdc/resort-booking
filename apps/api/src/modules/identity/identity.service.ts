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
  TwoFactorChallenge,
  UpdateOrganizationSettingsRequest,
  UpdateStaffProfileRequest,
} from '@resort-booking/shared-types';
import { isDevelopment, isProduction } from '../../shared/config/environment';
import { AuditService } from '../../shared/audit/audit.service';
import { fingerprint } from '../../shared/http/client-ip';
import type { StaffAccount, StaffSessionResult } from '../../shared/roles/staff-role';
import { DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD } from './identity.defaults';
import {
  createSessionToken,
  dummyPasswordHash,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './identity.password';
import { validatePassword } from '../../shared/validation/password-policy';
import { PasswordTooWeakException } from '../../shared/validation/password-too-weak.exception';
import { IdentityRepository } from './identity.repository';
import { LoginLimiter } from './login-limiter';
import { TwoFactorService } from './two-factor.service';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/** Where a sign-in attempt came from, for the limiter and the auth log. */
export interface LoginContext {
  ip: string | undefined;
  requestId: string | undefined;
}

@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger('Auth');

  public constructor(
    private readonly identity: IdentityRepository,
    private readonly config: ConfigService,
    private readonly limiter: LoginLimiter,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {}

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

  public async updateSettings(
    input: UpdateOrganizationSettingsRequest,
    organizationId: string,
  ): Promise<OrganizationSettings> {
    const current = await this.getSettings(organizationId);
    const saved = await this.identity.updateSettings(current.id, input);
    if (saved === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    return saved;
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
    const matches = await verifyPassword(password, staff === null ? await dummyPasswordHash() : staff.passwordHash);
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
    const session = await this.startSession(staff);
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
  public async startSession(staff: StaffAccount): Promise<StaffSessionResult> {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_MS);
    await this.identity.createSession(staff.id, hashSessionToken(token), expiresAt);
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
      },
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
    return this.identity.findStaffBySessionTokenHash(hashSessionToken(token));
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
    return this.identity.purgeExpiredSessions();
  }

  public async updateProfile(staffId: string, input: UpdateStaffProfileRequest): Promise<StaffAccount> {
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

  /** Who is asking, for the auth log: never the email or password itself, only a short hash of the email. */
  private describe(email: string, context: LoginContext): string {
    return `email#${fingerprint(email).slice(0, 12)} ip=${context.ip ?? 'unknown'} req=${context.requestId ?? 'none'}`;
  }
}

/** Postgres "unique_violation": the email already belongs to another account. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === '23505';
}
