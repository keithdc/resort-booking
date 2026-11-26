/**
 * @file apps/api/src/modules/identity/two-factor.service.ts
 * @feature identity
 * @dependencies TwoFactorRepository, TwoFactorCipher, TwoFactorLimiter, IdentityRepository, AuditService
 * Optional TOTP two-factor for staff: setup, enable, disable, recovery codes, and the second login step.
 * Secrets, codes and tokens are never logged or written to the audit log.
 */

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { TwoFactorChallenge, TwoFactorRecoveryCodes, TwoFactorSetup, TwoFactorStatus } from '@resort-booking/shared-types';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditActor } from '../../shared/audit/audit.types';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { createSessionToken, hashSessionToken, verifyPassword } from './identity.password';
import { IdentityRepository } from './identity.repository';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  TwoFactorCipher,
} from './two-factor.cipher';
import { TwoFactorLimiter } from './two-factor-limiter';
import { TwoFactorRepository, type TwoFactorState } from './two-factor.repository';
import { base32Encode, buildOtpauthUri, generateTotpSecret, looksLikeTotpCode, matchTotp } from './two-factor.totp';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const CHALLENGE_MAX_FAILURES = 5;

/** Where a request came from, for the limiter and the audit log. */
export interface TwoFactorContext {
  ip: string | undefined;
  requestId: string | undefined;
}

/** Which second factor was accepted. */
export type SecondFactorKind = 'totp' | 'recovery';

/** Who passed the login challenge. */
export interface ChallengePassed {
  staffUserId: string;
  organizationId: string;
  method: SecondFactorKind;
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger('TwoFactor');

  public constructor(
    private readonly store: TwoFactorRepository,
    private readonly cipher: TwoFactorCipher,
    private readonly limiter: TwoFactorLimiter,
    private readonly identity: IdentityRepository,
    private readonly audit: AuditService,
  ) {}

  /** Is two-factor switched on for this person? (Used by login: one cheap query.) */
  public isEnabled(staffUserId: string): Promise<boolean> {
    return this.store.isEnabled(staffUserId);
  }

  public async getStatus(staffUserId: string): Promise<TwoFactorStatus> {
    const state = await this.store.findState(staffUserId);
    const enabled = state?.enabledAt != null;
    return {
      enabled,
      enabledAt: state?.enabledAt?.toISOString() ?? null,
      setupPending: state !== null && !enabled,
      recoveryCodesRemaining: enabled ? state.recoveryCodeHashes.length : 0,
    };
  }

  /**
   * Issues a new secret. Nothing is protected until `enable` proves a code works, and calling it again simply
   * replaces an unconfirmed secret. Refused while two-factor is on.
   */
  public async setup(staff: StaffAccount): Promise<TwoFactorSetup> {
    const secret = generateTotpSecret();
    const saved = await this.store.savePendingSecret(staff.id, this.cipher.encrypt(secret, staff.id));
    if (!saved) {
      throw new ConflictException({ message: 'Two-factor authentication is already on', code: 'TWO_FACTOR_ALREADY_ENABLED' });
    }
    const secretBase32 = base32Encode(secret);
    return {
      secret: secretBase32,
      otpauthUri: buildOtpauthUri(staff.organizationName, staff.email, secretBase32),
      issuer: staff.organizationName,
      accountName: staff.email,
    };
  }

  /** Confirms the first code, switches two-factor on and returns the recovery codes (this once only). */
  public async enable(staff: StaffAccount, code: string, context: TwoFactorContext): Promise<TwoFactorRecoveryCodes> {
    await this.limiter.assertAllowed(staff.id, context.ip);
    const state = await this.store.findState(staff.id);
    if (state === null) {
      throw new ConflictException({ message: 'Start the setup first', code: 'TWO_FACTOR_SETUP_REQUIRED' });
    }
    if (state.enabledAt !== null) {
      throw new ConflictException({ message: 'Two-factor authentication is already on', code: 'TWO_FACTOR_ALREADY_ENABLED' });
    }
    const step = matchTotp(this.cipher.decrypt(state.secretEncrypted, staff.id), code, Date.now());
    if (step === null) {
      throw await this.wrongCode(staff, context, 'enable');
    }
    const recoveryCodes = generateRecoveryCodes();
    const activated = await this.store.activate(
      staff.id,
      step,
      recoveryCodes.map((item): string => hashRecoveryCode(item, staff.id)),
    );
    if (!activated) {
      throw new ConflictException({ message: 'Two-factor authentication is already on', code: 'TWO_FACTOR_ALREADY_ENABLED' });
    }
    await this.limiter.recordSuccess(staff.id);
    await this.audit.recordBy(actorOf(staff, context), 'auth.two_factor_enabled', { targetType: 'staff_user', targetId: staff.id });
    return { recoveryCodes };
  }

  /** Switches two-factor off. Needs the current password AND a valid code (or an unused recovery code). */
  public async disable(staff: StaffAccount, password: string, code: string, context: TwoFactorContext): Promise<void> {
    await this.proveBothFactors(staff, password, code, context, 'disable');
    await this.store.remove(staff.id);
    await this.audit.recordBy(actorOf(staff, context), 'auth.two_factor_disabled', { targetType: 'staff_user', targetId: staff.id });
  }

  /** Replaces all recovery codes with ten new ones (this once only). Needs the password and a code. */
  public async regenerateRecoveryCodes(
    staff: StaffAccount,
    password: string,
    code: string,
    context: TwoFactorContext,
  ): Promise<TwoFactorRecoveryCodes> {
    await this.proveBothFactors(staff, password, code, context, 'regenerate');
    const recoveryCodes = generateRecoveryCodes();
    await this.store.replaceRecoveryCodes(
      staff.id,
      recoveryCodes.map((item): string => hashRecoveryCode(item, staff.id)),
    );
    await this.audit.recordBy(actorOf(staff, context), 'auth.recovery_codes_regenerated', { targetType: 'staff_user', targetId: staff.id });
    return { recoveryCodes };
  }

  /**
   * After a correct password: a five-minute, single-purpose challenge instead of a session. Only its hash is
   * stored; it opens nothing but the second login step.
   */
  public async createChallenge(staffUserId: string): Promise<TwoFactorChallenge> {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await this.store.createChallenge(staffUserId, hashSessionToken(token), expiresAt);
    return { twoFactorRequired: true, challengeToken: token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Second login step: checks the challenge and the code. Wrong codes are limited per person and per IP (fail
   * closed), burn the challenge after five, and a used TOTP step or recovery code never works twice. On success
   * the challenge is consumed; the caller opens the session.
   */
  public async completeChallenge(challengeToken: string, code: string, context: TwoFactorContext): Promise<ChallengePassed> {
    const challenge = await this.store.findChallenge(hashSessionToken(challengeToken));
    if (challenge === null) {
      await this.limiter.recordFailure(null, context.ip);
      throw new UnauthorizedException({ message: 'This sign-in has expired. Start again.', code: 'TWO_FACTOR_CHALLENGE_INVALID' });
    }
    await this.limiter.assertAllowed(challenge.staffUserId, context.ip);

    const method = await this.checkSecondFactor(challenge.staffUserId, code);
    if (method === null) {
      await this.limiter.recordFailure(challenge.staffUserId, context.ip);
      const attempts = await this.store.recordChallengeFailure(challenge.id);
      if (attempts >= CHALLENGE_MAX_FAILURES) {
        await this.store.deleteChallenge(challenge.id);
      }
      await this.audit.record({
        organizationId: challenge.organizationId,
        staffUserId: challenge.staffUserId,
        action: 'auth.two_factor_failed',
        targetType: 'staff_user',
        targetId: challenge.staffUserId,
        metadata: { scope: 'login', challengeBurned: attempts >= CHALLENGE_MAX_FAILURES },
        ipHash: context.ip === undefined ? null : this.audit.hashIp(context.ip),
        requestId: context.requestId ?? null,
      });
      this.logger.warn(`two_factor.failed staff=${challenge.staffUserId} scope=login`);
      throw new UnauthorizedException({ message: 'That code is not valid', code: 'TWO_FACTOR_CODE_INVALID' });
    }

    // One use only: whoever deletes the row first gets the session.
    if (!(await this.store.deleteChallenge(challenge.id))) {
      throw new UnauthorizedException({ message: 'This sign-in has expired. Start again.', code: 'TWO_FACTOR_CHALLENGE_INVALID' });
    }
    await this.limiter.recordSuccess(challenge.staffUserId);
    if (method === 'recovery') {
      const state = await this.store.findState(challenge.staffUserId);
      await this.audit.record({
        organizationId: challenge.organizationId,
        staffUserId: challenge.staffUserId,
        action: 'auth.recovery_code_used',
        targetType: 'staff_user',
        targetId: challenge.staffUserId,
        metadata: { remaining: state?.recoveryCodeHashes.length ?? 0 },
        ipHash: context.ip === undefined ? null : this.audit.hashIp(context.ip),
        requestId: context.requestId ?? null,
      });
    }
    return { staffUserId: challenge.staffUserId, organizationId: challenge.organizationId, method };
  }

  /**
   * Admin reset (lost phone): removes the member's two-factor. The organization is enforced in SQL, so a member
   * of another workspace is "not found".
   */
  public async resetForMember(organizationId: string, staffUserId: string): Promise<{ hadTwoFactor: boolean }> {
    const outcome = await this.store.removeForMember(organizationId, staffUserId);
    if (outcome === null) {
      throw new NotFoundException({ message: 'Team member not found', code: 'STAFF_NOT_FOUND' });
    }
    return outcome;
  }

  // --- Internals ---

  /** Password first (a stolen session must not be enough), then a code; both count toward the limiter. */
  private async proveBothFactors(
    staff: StaffAccount,
    password: string,
    code: string,
    context: TwoFactorContext,
    scope: string,
  ): Promise<void> {
    await this.limiter.assertAllowed(staff.id, context.ip);
    const credentials = await this.identity.findStaffById(staff.id);
    if (credentials === null) {
      throw new NotFoundException({ message: 'Staff not found', code: 'STAFF_NOT_FOUND' });
    }
    if (!(await this.store.isEnabled(staff.id))) {
      throw new ConflictException({ message: 'Two-factor authentication is not on', code: 'TWO_FACTOR_NOT_ENABLED' });
    }
    if (!(await verifyPassword(password, credentials.passwordHash))) {
      await this.limiter.recordFailure(staff.id, context.ip);
      throw new UnauthorizedException({ message: 'Current password is wrong', code: 'STAFF_PASSWORD_MISMATCH' });
    }
    if ((await this.checkSecondFactor(staff.id, code)) === null) {
      throw await this.wrongCode(staff, context, scope);
    }
    await this.limiter.recordSuccess(staff.id);
  }

  /**
   * Accepts an authenticator code (once per 30-second step, atomically) or an unused recovery code (removed in
   * the same statement that accepts it). Null for anything else, including a replay.
   */
  private async checkSecondFactor(staffUserId: string, input: string): Promise<SecondFactorKind | null> {
    const state: TwoFactorState | null = await this.store.findState(staffUserId);
    if (state?.enabledAt == null) {
      return null;
    }
    if (looksLikeTotpCode(input)) {
      const step = matchTotp(this.cipher.decrypt(state.secretEncrypted, staffUserId), input, Date.now());
      if (step === null || !(await this.store.acceptStep(staffUserId, step))) {
        return null;
      }
      return 'totp';
    }
    if (looksLikeRecoveryCode(input) && (await this.store.consumeRecoveryCode(staffUserId, hashRecoveryCode(input, staffUserId)))) {
      return 'recovery';
    }
    return null;
  }

  /** Counts, audits and builds the 401 for a wrong code. */
  private async wrongCode(staff: StaffAccount, context: TwoFactorContext, scope: string): Promise<UnauthorizedException> {
    await this.limiter.recordFailure(staff.id, context.ip);
    await this.audit.recordBy(actorOf(staff, context), 'auth.two_factor_failed', {
      targetType: 'staff_user',
      targetId: staff.id,
      metadata: { scope },
    });
    this.logger.warn(`two_factor.failed staff=${staff.id} scope=${scope}`);
    return new UnauthorizedException({ message: 'That code is not valid', code: 'TWO_FACTOR_CODE_INVALID' });
  }
}

function actorOf(staff: StaffAccount, context: TwoFactorContext): AuditActor {
  return { organizationId: staff.organizationId, staffUserId: staff.id, ip: context.ip, requestId: context.requestId };
}
