/**
 * @file apps/api/src/modules/identity/two-factor.service.spec.ts
 * @feature identity
 * @dependencies TwoFactorService with an in-memory repository that has the same atomic rules as the SQL
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditActor, AuditEntry } from '../../shared/audit/audit.types';
import { RateLimitedException } from '../../shared/http/rate-limited.exception';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { hashPassword, hashSessionToken } from './identity.password';
import { IdentityRepository, type StaffCredentials } from './identity.repository';
import { TwoFactorCipher } from './two-factor.cipher';
import { TwoFactorLimiter } from './two-factor-limiter';
import { TwoFactorRepository, type ChallengeRecord, type TwoFactorState } from './two-factor.repository';
import { CHALLENGE_MAX_FAILURES, CHALLENGE_TTL_MS, TwoFactorService } from './two-factor.service';
import { base32Decode, hotp, timeStep } from './two-factor.totp';

const ORG = '11111111-1111-1111-1111-111111111111';
const ME = '2ae67f87-fcbf-4904-850f-a915246e0fab';
const OTHER = '3be67f87-fcbf-4904-850f-a915246e0fac';
const CTX = { ip: '203.0.113.7', requestId: 'req-1' };
const PASSWORD = 'Correct-horse-9';
const TOKEN = 'a'.repeat(64);

const STAFF: StaffAccount = { id: ME, organizationId: ORG, fullName: 'Ada', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true };

/** The same rules as the SQL: single atomic checks, no read-then-write gaps. */
class FakeStore {
  public states = new Map<string, { secretEncrypted: string; enabledAt: Date | null; lastUsedStep: number | null; hashes: string[] }>();
  public challenges = new Map<string, { id: string; staffUserId: string; organizationId: string; failed: number; expiresAt: Date }>();
  public members = new Map<string, string>([[ME, ORG], [OTHER, 'other-org']]);

  public findState = jest.fn((id: string): Promise<TwoFactorState | null> => {
    const s = this.states.get(id);
    return Promise.resolve(s === undefined ? null : { secretEncrypted: s.secretEncrypted, enabledAt: s.enabledAt, lastUsedStep: s.lastUsedStep, recoveryCodeHashes: [...s.hashes] });
  });
  public isEnabled = jest.fn((id: string): Promise<boolean> => Promise.resolve(this.states.get(id)?.enabledAt != null));
  public savePendingSecret = jest.fn((id: string, secret: string): Promise<boolean> => {
    const s = this.states.get(id);
    if (s?.enabledAt != null) {
      return Promise.resolve(false);
    }
    this.states.set(id, { secretEncrypted: secret, enabledAt: null, lastUsedStep: null, hashes: [] });
    return Promise.resolve(true);
  });
  public activate = jest.fn((id: string, step: number, hashes: string[]): Promise<boolean> => {
    const s = this.states.get(id);
    if (s === undefined || s.enabledAt !== null) {
      return Promise.resolve(false);
    }
    Object.assign(s, { enabledAt: new Date(), lastUsedStep: step, hashes });
    return Promise.resolve(true);
  });
  public acceptStep = jest.fn((id: string, step: number): Promise<boolean> => {
    const s = this.states.get(id);
    if (s?.enabledAt == null || (s.lastUsedStep !== null && s.lastUsedStep >= step)) {
      return Promise.resolve(false);
    }
    s.lastUsedStep = step;
    return Promise.resolve(true);
  });
  public consumeRecoveryCode = jest.fn((id: string, hash: string): Promise<boolean> => {
    const s = this.states.get(id);
    if (s?.enabledAt == null || !s.hashes.includes(hash)) {
      return Promise.resolve(false);
    }
    s.hashes = s.hashes.filter((h): boolean => h !== hash);
    return Promise.resolve(true);
  });
  public replaceRecoveryCodes = jest.fn((id: string, hashes: string[]): Promise<boolean> => {
    const s = this.states.get(id);
    if (s?.enabledAt == null) {
      return Promise.resolve(false);
    }
    s.hashes = hashes;
    return Promise.resolve(true);
  });
  public remove = jest.fn((id: string): Promise<boolean> => {
    for (const [key, c] of this.challenges) {
      if (c.staffUserId === id) {
        this.challenges.delete(key);
      }
    }
    return Promise.resolve(this.states.delete(id));
  });
  public removeForMember = jest.fn((org: string, id: string): Promise<{ hadTwoFactor: boolean } | null> => {
    if (this.members.get(id) !== org) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ hadTwoFactor: this.states.delete(id) });
  });
  public createChallenge = jest.fn((id: string, tokenHash: string, expiresAt: Date): Promise<void> => {
    for (const [key, c] of this.challenges) {
      if (c.staffUserId === id) {
        this.challenges.delete(key);
      }
    }
    this.challenges.set(tokenHash, { id: `ch-${tokenHash.slice(0, 8)}`, staffUserId: id, organizationId: this.members.get(id) ?? ORG, failed: 0, expiresAt });
    return Promise.resolve();
  });
  public findChallenge = jest.fn((tokenHash: string): Promise<ChallengeRecord | null> => {
    const c = this.challenges.get(tokenHash);
    return Promise.resolve(c === undefined || c.expiresAt.getTime() <= Date.now() ? null : { id: c.id, staffUserId: c.staffUserId, organizationId: c.organizationId, failedAttempts: c.failed });
  });
  public recordChallengeFailure = jest.fn((challengeId: string): Promise<number> => {
    for (const c of this.challenges.values()) {
      if (c.id === challengeId) {
        c.failed += 1;
        return Promise.resolve(c.failed);
      }
    }
    return Promise.resolve(0);
  });
  public deleteChallenge = jest.fn((challengeId: string): Promise<boolean> => {
    for (const [key, c] of this.challenges) {
      if (c.id === challengeId) {
        this.challenges.delete(key);
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
  });
}

describe('TwoFactorService', () => {
  const store = new FakeStore();
  const audits: AuditEntry[] = [];
  const logs: string[] = [];
  const assertAllowed = jest.fn<Promise<void>, [string, string | undefined]>();
  const recordFailure = jest.fn<Promise<void>, [string | null, string | undefined]>();
  const recordSuccess = jest.fn<Promise<void>, [string]>();
  const findStaffById = jest.fn<Promise<StaffCredentials | null>, [string]>();
  const deleteSessionsExcept = jest.fn<Promise<number>, [string, string | null]>();
  let passwordHash: string;
  let service: TwoFactorService;

  function secretOf(staffId: string): Buffer {
    const state = store.states.get(staffId);
    if (state === undefined) {
      throw new Error('no state');
    }
    return new TwoFactorCipher(new ConfigService({ TWO_FACTOR_ENCRYPTION_KEY: 'ab'.repeat(32) })).decrypt(state.secretEncrypted, staffId);
  }

  /** The code the phone shows `offsetSteps` steps from now. */
  function codeNow(staffId: string, offsetSteps = 0): string {
    return hotp(secretOf(staffId), timeStep(Date.now()) + offsetSteps);
  }

  /** Runs setup + enable for ME and returns the recovery codes. */
  async function enrolled(): Promise<string[]> {
    await service.setup(STAFF, PASSWORD, CTX);
    const { recoveryCodes } = await service.enable(STAFF, PASSWORD, codeNow(ME), CTX, TOKEN);
    return recoveryCodes;
  }

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    store.states.clear();
    store.challenges.clear();
    audits.length = 0;
    logs.length = 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]): void => {
        logs.push(String(args[0]));
      });
    }
    assertAllowed.mockReset().mockResolvedValue(undefined);
    recordFailure.mockReset().mockResolvedValue(undefined);
    recordSuccess.mockReset().mockResolvedValue(undefined);
    deleteSessionsExcept.mockReset().mockResolvedValue(2);
    findStaffById.mockReset().mockImplementation((id) => Promise.resolve({ ...STAFF, id, active: true, passwordHash }));
    passwordHash ??= await hashPassword(PASSWORD);
    findStaffById.mockImplementation((id) => Promise.resolve({ ...STAFF, id, active: true, passwordHash }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: TwoFactorRepository, useValue: store },
        { provide: TwoFactorCipher, useValue: new TwoFactorCipher(new ConfigService({ TWO_FACTOR_ENCRYPTION_KEY: 'ab'.repeat(32) })) },
        { provide: TwoFactorLimiter, useValue: { assertAllowed, recordFailure, recordSuccess } },
        { provide: IdentityRepository, useValue: { findStaffById, deleteSessionsExcept } },
        {
          provide: AuditService,
          useValue: {
            record: (entry: AuditEntry): Promise<boolean> => {
              audits.push(entry);
              return Promise.resolve(true);
            },
            recordBy: (actor: AuditActor, action: string, details: Partial<AuditEntry> = {}): Promise<boolean> => {
              audits.push({ ...details, organizationId: actor.organizationId, staffUserId: actor.staffUserId, action });
              return Promise.resolve(true);
            },
            hashIp: (ip: string): string => `ip:${ip}`,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(TwoFactorService);
  });

  describe('setup and enable', () => {
    it('setup returns a base32 secret and an otpauth URI, stores it encrypted and does not enable anything', async () => {
      const setup = await service.setup(STAFF, PASSWORD, CTX);

      expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(setup.otpauthUri).toContain(`secret=${setup.secret}`);
      expect(setup.otpauthUri.startsWith('otpauth://totp/')).toBe(true);
      expect(setup.issuer).toBe('Humphreys');
      expect(setup.accountName).toBe('ada@example.com');
      const stored = store.states.get(ME);
      expect(stored?.secretEncrypted).not.toContain(setup.secret);
      expect(base32Decode(setup.secret)?.equals(secretOf(ME))).toBe(true);
      expect(await service.isEnabled(ME)).toBe(false);
      await expect(service.getStatus(ME)).resolves.toEqual({ enabled: false, enabledAt: null, setupPending: true, recoveryCodesRemaining: 0 });
    });

    it('calling setup again replaces the unconfirmed secret', async () => {
      const first = await service.setup(STAFF, PASSWORD, CTX);
      const second = await service.setup(STAFF, PASSWORD, CTX);
      expect(second.secret).not.toBe(first.secret);
    });

    it('enable with the right code turns it on and returns ten recovery codes, stored only as hashes', async () => {
      await service.setup(STAFF, PASSWORD, CTX);

      const { recoveryCodes } = await service.enable(STAFF, PASSWORD, codeNow(ME), CTX, TOKEN);

      expect(recoveryCodes).toHaveLength(10);
      expect(store.states.get(ME)?.hashes).toHaveLength(10);
      expect(store.states.get(ME)?.hashes.join(' ')).not.toContain(recoveryCodes[0]);
      await expect(service.getStatus(ME)).resolves.toMatchObject({ enabled: true, setupPending: false, recoveryCodesRemaining: 10 });
      expect(audits.map((a) => a.action)).toEqual(['auth.two_factor_enabled']);
      expect(recordSuccess).toHaveBeenCalledWith(ME);
    });

    it('enable with a wrong code keeps it off, counts the failure and audits it', async () => {
      await service.setup(STAFF, PASSWORD, CTX);
      const right = codeNow(ME);
      const wrong = right === '000000' ? '000001' : '000000';

      await expect(service.enable(STAFF, PASSWORD, wrong, CTX, TOKEN)).rejects.toMatchObject({ status: 401, response: { code: 'TWO_FACTOR_CODE_INVALID' } });

      expect(await service.isEnabled(ME)).toBe(false);
      expect(recordFailure).toHaveBeenCalledWith(ME, CTX.ip);
      expect(audits.map((a) => a.action)).toEqual(['auth.two_factor_failed']);
    });

    it('enable needs a setup first, and cannot be done twice', async () => {
      await expect(service.enable(STAFF, PASSWORD, '123456', CTX, TOKEN)).rejects.toMatchObject({ status: 409, response: { code: 'TWO_FACTOR_SETUP_REQUIRED' } });

      await enrolled();
      await expect(service.enable(STAFF, PASSWORD, codeNow(ME, 1), CTX, TOKEN)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_ALREADY_ENABLED' } });
      await expect(service.setup(STAFF, PASSWORD, CTX)).rejects.toMatchObject({ status: 409, response: { code: 'TWO_FACTOR_ALREADY_ENABLED' } });
    });

    it('setup and enable need the current password: a wrong one changes nothing and counts as a failure', async () => {
      await expect(service.setup(STAFF, 'wrong-password', CTX)).rejects.toMatchObject({ status: 401, response: { code: 'STAFF_PASSWORD_MISMATCH' } });
      expect(store.states.has(ME)).toBe(false);

      await service.setup(STAFF, PASSWORD, CTX);
      await expect(service.enable(STAFF, 'wrong-password', codeNow(ME), CTX, TOKEN)).rejects.toMatchObject({
        status: 401,
        response: { code: 'STAFF_PASSWORD_MISMATCH' },
      });

      expect(await service.isEnabled(ME)).toBe(false);
      expect(recordFailure).toHaveBeenCalledTimes(2);
      expect(deleteSessionsExcept).not.toHaveBeenCalled();
    });

    it('enable signs the person out everywhere else, keeps the current session and audits how many', async () => {
      await service.setup(STAFF, PASSWORD, CTX);

      await service.enable(STAFF, PASSWORD, codeNow(ME), CTX, TOKEN);

      expect(deleteSessionsExcept).toHaveBeenCalledWith(ME, hashSessionToken(TOKEN));
      expect(audits.at(-1)).toMatchObject({ action: 'auth.two_factor_enabled', metadata: { otherSessionsRevoked: 2 } });
    });

    it('a wrong code does not end any session', async () => {
      await service.setup(STAFF, PASSWORD, CTX);

      await expect(service.enable(STAFF, PASSWORD, '000000', CTX, TOKEN)).rejects.toBeDefined();

      expect(deleteSessionsExcept).not.toHaveBeenCalled();
    });

    it('is blocked by the limiter before any code is looked at', async () => {
      await service.setup(STAFF, PASSWORD, CTX);
      assertAllowed.mockRejectedValue(new RateLimitedException('TWO_FACTOR_RATE_LIMITED', 'slow down', 60));

      await expect(service.enable(STAFF, PASSWORD, codeNow(ME), CTX, TOKEN)).rejects.toMatchObject({ status: 429 });

      expect(await service.isEnabled(ME)).toBe(false);
      expect(store.findState).not.toHaveBeenCalled();
    });
  });

  describe('the login challenge', () => {
    it('is single-purpose and short-lived: only its hash is stored, it lasts five minutes', async () => {
      await enrolled();

      const challenge = await service.createChallenge(ME);

      expect(challenge.twoFactorRequired).toBe(true);
      expect(challenge.challengeToken).toMatch(/^[0-9a-f]{64}$/);
      const stored = [...store.challenges.keys()];
      expect(stored).toEqual([hashSessionToken(challenge.challengeToken)]);
      const ttl = new Date(challenge.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(CHALLENGE_TTL_MS - 5000);
      expect(ttl).toBeLessThanOrEqual(CHALLENGE_TTL_MS);
    });

    it('a correct code passes, consumes the challenge and works only once', async () => {
      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);

      const passed = await service.completeChallenge(challengeToken, codeNow(ME, 1), CTX);

      expect(passed).toEqual({ staffUserId: ME, organizationId: ORG, method: 'totp' });
      expect(store.challenges.size).toBe(0);
      await expect(service.completeChallenge(challengeToken, codeNow(ME, 1), CTX)).rejects.toMatchObject({
        status: 401,
        response: { code: 'TWO_FACTOR_CHALLENGE_INVALID' },
      });
    });

    it('accepts codes from the previous and next step (window) but not two steps away', async () => {
      await enrolled();
      let challenge = await service.createChallenge(ME);
      await expect(service.completeChallenge(challenge.challengeToken, codeNow(ME, 1), CTX)).resolves.toMatchObject({ method: 'totp' });

      challenge = await service.createChallenge(ME);
      await expect(service.completeChallenge(challenge.challengeToken, codeNow(ME, 2), CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CODE_INVALID' },
      });
    });

    it('a used time step can never be replayed, not even in a new challenge', async () => {
      await enrolled();
      const code = codeNow(ME, 1);
      const first = await service.createChallenge(ME);
      await service.completeChallenge(first.challengeToken, code, CTX);

      const second = await service.createChallenge(ME);
      await expect(service.completeChallenge(second.challengeToken, code, CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CODE_INVALID' },
      });
      // An OLDER step than the last accepted one is a replay too.
      await expect(service.completeChallenge(second.challengeToken, codeNow(ME, 0), CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CODE_INVALID' },
      });
    });

    it('the step used to enable two-factor cannot be used to sign in', async () => {
      await service.setup(STAFF, PASSWORD, CTX);
      await service.enable(STAFF, PASSWORD, codeNow(ME), CTX, TOKEN);
      const { challengeToken } = await service.createChallenge(ME);

      await expect(service.completeChallenge(challengeToken, codeNow(ME), CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CODE_INVALID' },
      });
    });

    it('a wrong code is counted, audited without the code, and keeps the challenge until the fifth', async () => {
      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);

      for (let i = 1; i < CHALLENGE_MAX_FAILURES; i += 1) {
        await expect(service.completeChallenge(challengeToken, '000000', CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
      }
      expect(store.challenges.size).toBe(1);
      expect(recordFailure).toHaveBeenCalledTimes(CHALLENGE_MAX_FAILURES - 1);
      expect(recordFailure).toHaveBeenCalledWith(ME, CTX.ip);
      const failed = audits.filter((a) => a.action === 'auth.two_factor_failed');
      expect(failed).toHaveLength(CHALLENGE_MAX_FAILURES - 1);
      expect(JSON.stringify([audits, logs])).not.toContain('000000');
    });

    it('five wrong codes burn the challenge: even the right code then fails', async () => {
      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);

      for (let i = 0; i < CHALLENGE_MAX_FAILURES; i += 1) {
        await expect(service.completeChallenge(challengeToken, '000000', CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
      }

      expect(store.challenges.size).toBe(0);
      await expect(service.completeChallenge(challengeToken, codeNow(ME, 1), CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CHALLENGE_INVALID' },
      });
      expect(audits.at(-1)?.metadata).toMatchObject({ challengeBurned: true });
    });

    it('an unknown or expired token is refused and counted against the IP only', async () => {
      await expect(service.completeChallenge('f'.repeat(64), '123456', CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CHALLENGE_INVALID' },
      });
      expect(recordFailure).toHaveBeenCalledWith(null, CTX.ip);

      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);
      const entry = store.challenges.get(hashSessionToken(challengeToken));
      if (entry === undefined) {
        throw new Error('challenge missing');
      }
      entry.expiresAt = new Date(Date.now() - 1);
      await expect(service.completeChallenge(challengeToken, codeNow(ME, 1), CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CHALLENGE_INVALID' },
      });
    });

    it('is refused by the rate limit before the code is checked (per person and per IP, via the limiter)', async () => {
      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);
      assertAllowed.mockRejectedValue(new RateLimitedException('TWO_FACTOR_RATE_LIMITED', 'slow', 120));
      store.acceptStep.mockClear();

      await expect(service.completeChallenge(challengeToken, codeNow(ME, 1), CTX)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 });

      expect(assertAllowed).toHaveBeenCalledWith(ME, CTX.ip);
      expect(store.acceptStep).not.toHaveBeenCalled();
      expect(store.challenges.size).toBe(1);
    });

    it('fails closed: a limiter that cannot reach Redis stops the attempt', async () => {
      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);
      assertAllowed.mockRejectedValue(Object.assign(new Error('down'), { status: 503 }));

      await expect(service.completeChallenge(challengeToken, codeNow(ME, 1), CTX)).rejects.toThrow('down');

      expect(store.acceptStep).not.toHaveBeenCalled();
    });

    it('a new challenge replaces the earlier one', async () => {
      await enrolled();
      const first = await service.createChallenge(ME);
      await service.createChallenge(ME);

      await expect(service.completeChallenge(first.challengeToken, codeNow(ME, 1), CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CHALLENGE_INVALID' },
      });
    });

    it('two requests racing with one correct code: exactly one wins', async () => {
      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);
      const code = codeNow(ME, 1);

      const results = await Promise.allSettled([
        service.completeChallenge(challengeToken, code, CTX),
        service.completeChallenge(challengeToken, code, CTX),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
  });

  describe('recovery codes', () => {
    it('a recovery code signs in once, in any case or dash style, and is then gone', async () => {
      const codes = await enrolled();
      const code = codes[0] ?? '';
      const first = await service.createChallenge(ME);

      const passed = await service.completeChallenge(first.challengeToken, code.toLowerCase().replace('-', ' '), CTX);

      expect(passed.method).toBe('recovery');
      expect(store.states.get(ME)?.hashes).toHaveLength(9);
      const second = await service.createChallenge(ME);
      await expect(service.completeChallenge(second.challengeToken, code, CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
    });

    it('audits the use with how many are left, never the code', async () => {
      const codes = await enrolled();
      const { challengeToken } = await service.createChallenge(ME);

      await service.completeChallenge(challengeToken, codes[3] ?? '', CTX);

      const used = audits.find((a) => a.action === 'auth.recovery_code_used');
      expect(used?.metadata).toEqual({ remaining: 9 });
      expect(JSON.stringify([audits, logs])).not.toContain(codes[3]);
    });

    it('a code that was never issued, or a code for someone else, is refused', async () => {
      await enrolled();
      const { challengeToken } = await service.createChallenge(ME);

      await expect(service.completeChallenge(challengeToken, 'AAAAA-AAAAA', CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
    });

    it('regenerating needs password and code, replaces all ten and audits it', async () => {
      const old = await enrolled();

      const { recoveryCodes } = await service.regenerateRecoveryCodes(STAFF, PASSWORD, codeNow(ME, 1), CTX);

      expect(recoveryCodes).toHaveLength(10);
      expect(recoveryCodes).not.toEqual(old);
      expect(store.states.get(ME)?.hashes).toHaveLength(10);
      expect(audits.at(-1)?.action).toBe('auth.recovery_codes_regenerated');
      const { challengeToken } = await service.createChallenge(ME);
      await expect(service.completeChallenge(challengeToken, old[0] ?? '', CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
    });

    it('regenerating with a wrong password or wrong code changes nothing', async () => {
      await enrolled();
      const before = [...(store.states.get(ME)?.hashes ?? [])];

      await expect(service.regenerateRecoveryCodes(STAFF, 'wrong-password', codeNow(ME, 1), CTX)).rejects.toMatchObject({
        response: { code: 'STAFF_PASSWORD_MISMATCH' },
      });
      await expect(service.regenerateRecoveryCodes(STAFF, PASSWORD, '000000', CTX)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CODE_INVALID' },
      });

      expect(store.states.get(ME)?.hashes).toEqual(before);
      expect(recordFailure).toHaveBeenCalledTimes(2);
    });

    it('a recovery code can prove the second factor when disabling', async () => {
      const codes = await enrolled();

      await service.disable(STAFF, PASSWORD, codes[1] ?? '', CTX);

      expect(await service.isEnabled(ME)).toBe(false);
    });
  });

  describe('disable', () => {
    it('needs the password AND a valid code, then removes everything and audits it', async () => {
      await enrolled();
      await service.createChallenge(ME);

      await service.disable(STAFF, PASSWORD, codeNow(ME, 1), CTX);

      expect(store.states.has(ME)).toBe(false);
      expect(store.challenges.size).toBe(0);
      expect(audits.at(-1)).toMatchObject({ action: 'auth.two_factor_disabled', targetId: ME });
      await expect(service.getStatus(ME)).resolves.toEqual({ enabled: false, enabledAt: null, setupPending: false, recoveryCodesRemaining: 0 });
    });

    it('a wrong password leaves it on', async () => {
      await enrolled();

      await expect(service.disable(STAFF, 'nope', codeNow(ME, 1), CTX)).rejects.toMatchObject({ status: 401, response: { code: 'STAFF_PASSWORD_MISMATCH' } });

      expect(await service.isEnabled(ME)).toBe(true);
    });

    it('a wrong code leaves it on, even with the right password', async () => {
      await enrolled();

      await expect(service.disable(STAFF, PASSWORD, '000000', CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });

      expect(await service.isEnabled(ME)).toBe(true);
    });

    it('refuses when it is not on', async () => {
      await expect(service.disable(STAFF, PASSWORD, '123456', CTX)).rejects.toMatchObject({ status: 409, response: { code: 'TWO_FACTOR_NOT_ENABLED' } });
    });

    it('a replayed code cannot be used to disable', async () => {
      await enrolled();
      const code = codeNow(ME, 1);
      const { challengeToken } = await service.createChallenge(ME);
      await service.completeChallenge(challengeToken, code, CTX);

      await expect(service.disable(STAFF, PASSWORD, code, CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
    });
  });

  describe('admin reset', () => {
    it('removes the member\'s two-factor in their own organization', async () => {
      await enrolled();

      await expect(service.resetForMember(ORG, ME)).resolves.toEqual({ hadTwoFactor: true });
      await expect(service.resetForMember(ORG, ME)).resolves.toEqual({ hadTwoFactor: false });
      expect(await service.isEnabled(ME)).toBe(false);
    });

    it('is a 404 for a member of another organization, and leaves their two-factor alone (tenant isolation)', async () => {
      store.states.set(OTHER, { secretEncrypted: 'x', enabledAt: new Date(), lastUsedStep: null, hashes: [] });

      await expect(service.resetForMember(ORG, OTHER)).rejects.toMatchObject({ status: 404, response: { code: 'STAFF_NOT_FOUND' } });

      expect(store.states.has(OTHER)).toBe(true);
    });
  });
});
