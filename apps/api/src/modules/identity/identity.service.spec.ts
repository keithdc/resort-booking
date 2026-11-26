/**
 * @file apps/api/src/modules/identity/identity.service.spec.ts
 * @feature identity
 * @dependencies IdentityService, @nestjs/testing
 */

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { OrganizationSettings, TwoFactorChallenge } from '@resort-booking/shared-types';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditEntry } from '../../shared/audit/audit.types';
import type { StaffAccount, StaffSessionResult } from '../../shared/roles/staff-role';
import { RateLimitedException } from '../../shared/http/rate-limited.exception';
import { DEV_OWNER_EMAIL, DEV_OWNER_PASSWORD } from './identity.defaults';
import { hashPassword, hashSessionToken } from './identity.password';
import { IdentityRepository, type StaffCredentials } from './identity.repository';
import { IdentityService } from './identity.service';
import { LoginLimiter } from './login-limiter';
import { TwoFactorService } from './two-factor.service';

type StaffWithHash = StaffCredentials;

/** A login answer that must be a session (the account has no two-factor). */
function sessionOf(result: StaffSessionResult | TwoFactorChallenge): StaffSessionResult {
  if ('twoFactorRequired' in result) {
    throw new Error('Expected a session, got a two-factor challenge');
  }
  return result;
}

const ORG = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '2ae67f87-fcbf-4904-850f-a915246e0fab';
const CONTEXT = { ip: '203.0.113.7', requestId: 'req-test-0001' };

const SETTINGS: OrganizationSettings = {
  id: ORG,
  name: 'Humphreys',
  legalName: '',
  legalAddress: '',
  vatNumber: '',
  iban: '',
  bic: '',
  bankAccountName: '',
  contactEmail: '',
  contactPhone: '',
  ownerName: 'Owner',
  bookingEmail: '',
  guestReplyEmail: '',
};

describe('IdentityService', () => {
  const findStaffByEmail = jest.fn<Promise<StaffWithHash | null>, [string]>();
  const findStaffById = jest.fn<Promise<StaffWithHash | null>, [string]>();
  const findStaffBySessionTokenHash = jest.fn<Promise<StaffAccount | null>, [string]>();
  const touchLastLogin = jest.fn<Promise<void>, [string]>();
  const auditRecord = jest.fn<Promise<boolean>, [AuditEntry]>();
  const createSession = jest.fn<Promise<void>, [string, string, Date]>();
  const deleteSessionsExcept = jest.fn<Promise<number>, [string, string | null]>();
  const purgeExpiredSessions = jest.fn<Promise<number>, []>();
  const updateStaffPassword = jest.fn<Promise<void>, [string, string]>();
  const countStaffUsers = jest.fn<Promise<number>, []>();
  const getSettings = jest.fn<Promise<OrganizationSettings | null>, []>();
  const insertStaffUser = jest.fn<Promise<StaffAccount>, [string, string, string, string]>();
  const assertAllowed = jest.fn<Promise<void>, [string, string | undefined]>();
  const recordFailure = jest.fn<Promise<void>, [string, string | undefined]>();
  const recordSuccess = jest.fn<Promise<void>, [string]>();
  const isEnabled = jest.fn<Promise<boolean>, [string]>();
  const createChallenge = jest.fn<Promise<TwoFactorChallenge>, [string]>();
  const completeChallenge = jest.fn<Promise<{ staffUserId: string; organizationId: string; method: 'totp' | 'recovery' }>, [string, string, unknown]>();
  const resetForMember = jest.fn<Promise<{ hadTwoFactor: boolean }>, [string, string]>();
  const settings: Record<string, string> = {};
  const logs: string[] = [];
  let storedHash: string;
  let service: IdentityService;

  function owner(): StaffWithHash {
    return {
      id: STAFF_ID,
      organizationId: ORG,
      fullName: 'Owner',
      email: 'owner@example.com',
      role: 'admin',
      organizationName: 'Humphreys',
      active: true,
      passwordHash: storedHash,
    };
  }

  async function build(): Promise<IdentityService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        IdentityService,
        {
          provide: IdentityRepository,
          useValue: {
            findStaffByEmail,
            findStaffById,
            findStaffBySessionTokenHash,
            createSession,
            deleteSessionsExcept,
            purgeExpiredSessions,
            updateStaffPassword,
            countStaffUsers,
            getSettings,
            insertStaffUser,
            touchLastLogin,
          },
        },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => settings[name] } },
        { provide: LoginLimiter, useValue: { assertAllowed, recordFailure, recordSuccess } },
        { provide: TwoFactorService, useValue: { isEnabled, createChallenge, completeChallenge, resetForMember } },
        {
          provide: AuditService,
          useValue: { record: auditRecord, hashIp: (ip: string): string => `ip:${ip}`, hashEmail: (email: string): string => `email:${email}` },
        },
      ],
    }).compile();
    return moduleRef.get(IdentityService);
  }

  beforeAll(async () => {
    storedHash = await hashPassword('Correct-horse-9');
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const key of Object.keys(settings)) {
      delete settings[key];
    }
    logs.length = 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]): void => {
        logs.push(String(args[0]));
      });
    }
    assertAllowed.mockResolvedValue(undefined);
    recordFailure.mockResolvedValue(undefined);
    recordSuccess.mockResolvedValue(undefined);
    createSession.mockResolvedValue(undefined);
    touchLastLogin.mockResolvedValue(undefined);
    auditRecord.mockResolvedValue(true);
    deleteSessionsExcept.mockResolvedValue(0);
    findStaffByEmail.mockResolvedValue(null);
    isEnabled.mockResolvedValue(false);
    service = await build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NODE_ENV;
  });

  describe('login with two-factor', () => {
    const challenge: TwoFactorChallenge = { twoFactorRequired: true, challengeToken: 'c'.repeat(64), expiresAt: '2026-11-26T12:05:00.000Z' };

    it('without two-factor the answer is the unchanged session shape and no challenge is made', async () => {
      findStaffByEmail.mockResolvedValue(owner());

      const result = await service.login('owner@example.com', 'Correct-horse-9', CONTEXT);

      expect(Object.keys(result).sort()).toEqual(['expiresAt', 'staff', 'token']);
      expect(createChallenge).not.toHaveBeenCalled();
    });

    it('with two-factor a correct password buys a challenge and NO session', async () => {
      findStaffByEmail.mockResolvedValue(owner());
      isEnabled.mockResolvedValue(true);
      createChallenge.mockResolvedValue(challenge);

      const result = await service.login('owner@example.com', 'Correct-horse-9', CONTEXT);

      expect(result).toEqual(challenge);
      expect(createSession).not.toHaveBeenCalled();
      expect(touchLastLogin).not.toHaveBeenCalled();
      expect(auditRecord).not.toHaveBeenCalled();
      expect(createChallenge).toHaveBeenCalledWith(STAFF_ID);
    });

    it('a wrong password never reaches the challenge, even for an account with two-factor', async () => {
      findStaffByEmail.mockResolvedValue(owner());
      isEnabled.mockResolvedValue(true);

      await expect(service.login('owner@example.com', 'wrong', CONTEXT)).rejects.toMatchObject({ response: { code: 'STAFF_LOGIN_FAILED' } });

      expect(isEnabled).not.toHaveBeenCalled();
      expect(createChallenge).not.toHaveBeenCalled();
    });

    it('the second step opens the normal session and audits the login as two-factor', async () => {
      completeChallenge.mockResolvedValue({ staffUserId: STAFF_ID, organizationId: ORG, method: 'totp' });
      findStaffById.mockResolvedValue(owner());

      const result = await service.completeTwoFactorLogin('c'.repeat(64), '123456', CONTEXT);

      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.staff.id).toBe(STAFF_ID);
      expect(createSession).toHaveBeenCalledWith(STAFF_ID, hashSessionToken(result.token), expect.any(Date));
      expect(touchLastLogin).toHaveBeenCalledWith(STAFF_ID);
      expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login', metadata: { twoFactor: true } }));
    });

    it('a wrong code gives no session', async () => {
      completeChallenge.mockRejectedValue(new Error('nope'));

      await expect(service.completeTwoFactorLogin('c'.repeat(64), '000000', CONTEXT)).rejects.toThrow('nope');

      expect(createSession).not.toHaveBeenCalled();
    });

    it('a person switched off between the steps gets no session', async () => {
      completeChallenge.mockResolvedValue({ staffUserId: STAFF_ID, organizationId: ORG, method: 'totp' });
      findStaffById.mockResolvedValue({ ...owner(), active: false });

      await expect(service.completeTwoFactorLogin('c'.repeat(64), '123456', CONTEXT)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_CHALLENGE_INVALID' },
      });
      expect(createSession).not.toHaveBeenCalled();
    });

    it('an admin reset removes the two-factor in the given organization and ends every session', async () => {
      resetForMember.mockResolvedValue({ hadTwoFactor: true });
      deleteSessionsExcept.mockResolvedValue(2);

      await expect(service.resetTwoFactor(ORG, STAFF_ID)).resolves.toEqual({ hadTwoFactor: true });

      expect(resetForMember).toHaveBeenCalledWith(ORG, STAFF_ID);
      expect(deleteSessionsExcept).toHaveBeenCalledWith(STAFF_ID, null);
    });

    it('a member of another organization is not found and nobody is signed out', async () => {
      resetForMember.mockRejectedValue(new Error('not found'));

      await expect(service.resetTwoFactor('other-org', STAFF_ID)).rejects.toThrow('not found');

      expect(deleteSessionsExcept).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('signs in with the right password: a hashed session, the limiter cleared, a success logged', async () => {
      findStaffByEmail.mockResolvedValue(owner());

      const result = sessionOf(await service.login('  Owner@Example.com ', 'Correct-horse-9', CONTEXT));

      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.staff.email).toBe('owner@example.com');
      expect(createSession).toHaveBeenCalledWith(STAFF_ID, hashSessionToken(result.token), expect.any(Date));
      expect(createSession.mock.calls[0]?.[1]).not.toBe(result.token);
      expect(recordSuccess).toHaveBeenCalledWith('owner@example.com');
      expect(logs.join('\n')).toContain('login.success');
    });

    it('answers with the role and the workspace name, and notes the time of the last login', async () => {
      findStaffByEmail.mockResolvedValue({ ...owner(), role: 'employee' });

      const result = sessionOf(await service.login('owner@example.com', 'Correct-horse-9', CONTEXT));

      expect(result.staff).toEqual({
        id: STAFF_ID,
        organizationId: ORG,
        fullName: 'Owner',
        email: 'owner@example.com',
        role: 'employee',
        organizationName: 'Humphreys',
      });
      expect(touchLastLogin).toHaveBeenCalledWith(STAFF_ID);
    });

    it('writes auth.login to the audit log with hashed IP only', async () => {
      findStaffByEmail.mockResolvedValue(owner());

      await service.login('owner@example.com', 'Correct-horse-9', CONTEXT);

      expect(auditRecord).toHaveBeenCalledWith({
        organizationId: ORG,
        staffUserId: STAFF_ID,
        action: 'auth.login',
        ipHash: 'ip:203.0.113.7',
        requestId: 'req-test-0001',
      });
    });

    it('writes auth.login_failed with a hashed email (never the address) and the organization when the account exists', async () => {
      findStaffByEmail.mockResolvedValueOnce(owner());
      await service.login('owner@example.com', 'wrong-pass-1', CONTEXT).catch(() => undefined);
      findStaffByEmail.mockResolvedValueOnce(null);
      await service.login('ghost@example.com', 'wrong-pass-1', CONTEXT).catch(() => undefined);

      const [known, unknown] = auditRecord.mock.calls.map((call) => call[0]);
      expect(known).toMatchObject({ action: 'auth.login_failed', organizationId: ORG, staffUserId: STAFF_ID });
      expect(unknown).toMatchObject({ action: 'auth.login_failed', organizationId: null, staffUserId: null });
      expect(JSON.stringify(auditRecord.mock.calls)).not.toContain('example.com');
      expect(JSON.stringify(auditRecord.mock.calls)).not.toContain('wrong-pass-1');
    });

    it('treats a switched-off account exactly like a wrong password', async () => {
      findStaffByEmail.mockResolvedValue({ ...owner(), active: false });

      const refused = await service.login('owner@example.com', 'Correct-horse-9', CONTEXT).catch((error: unknown) => error);

      expect(refused).toMatchObject({ status: 401, response: { message: 'Email or password is wrong', code: 'STAFF_LOGIN_FAILED' } });
      expect(createSession).not.toHaveBeenCalled();
      expect(recordFailure).toHaveBeenCalledWith('owner@example.com', CONTEXT.ip);
    });

    it('asks the limiter first and checks no password when the account or network is locked', async () => {
      assertAllowed.mockRejectedValue(new RateLimitedException('LOGIN_RATE_LIMITED', 'locked', 600));

      await expect(service.login('owner@example.com', 'Correct-horse-9', CONTEXT)).rejects.toMatchObject({ status: 429 });

      expect(findStaffByEmail).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
      expect(logs.join('\n')).toContain('login.blocked');
    });

    it('does not sign in when the limiter cannot be reached (fail closed)', async () => {
      assertAllowed.mockRejectedValue(new ServiceUnavailableException({ code: 'LOGIN_UNAVAILABLE' }));

      await expect(service.login('owner@example.com', 'Correct-horse-9', CONTEXT)).rejects.toMatchObject({ status: 503 });
      expect(createSession).not.toHaveBeenCalled();
    });

    it('gives the same answer for a wrong password and an unknown email, counting both as failures', async () => {
      findStaffByEmail.mockResolvedValueOnce(owner());
      const wrongPassword = await service.login('owner@example.com', 'nope-nope-1', CONTEXT).catch((error: unknown) => error);
      findStaffByEmail.mockResolvedValueOnce(null);
      const unknownEmail = await service.login('ghost@example.com', 'nope-nope-1', CONTEXT).catch((error: unknown) => error);

      expect(wrongPassword).toMatchObject({ status: 401, response: { message: 'Email or password is wrong', code: 'STAFF_LOGIN_FAILED' } });
      expect(unknownEmail).toMatchObject({ status: 401, response: { message: 'Email or password is wrong', code: 'STAFF_LOGIN_FAILED' } });
      expect(recordFailure).toHaveBeenCalledWith('owner@example.com', CONTEXT.ip);
      expect(recordFailure).toHaveBeenCalledWith('ghost@example.com', CONTEXT.ip);
      expect(createSession).not.toHaveBeenCalled();
      expect(recordSuccess).not.toHaveBeenCalled();
    });

    it('still runs one full password verification for an unknown email (uniform timing)', async () => {
      const timed = async (email: string): Promise<number> => {
        const start = process.hrtime.bigint();
        await service.login(email, 'nope-nope-1', CONTEXT).catch(() => undefined);
        return Number(process.hrtime.bigint() - start) / 1e6;
      };
      findStaffByEmail.mockResolvedValue(owner());
      await timed('warm@example.com');
      const known = await timed('owner@example.com');
      findStaffByEmail.mockResolvedValue(null);
      const unknown = await timed('ghost@example.com');

      // A skipped hash would take well under a millisecond; a real scrypt takes several.
      expect(unknown).toBeGreaterThan(known / 4);
      expect(unknown).toBeGreaterThan(2);
    });

    it('logs failures with a short hash of the email and never the password, token or full email', async () => {
      findStaffByEmail.mockResolvedValue(owner());

      await service.login('owner@example.com', 'Wrong-password-7', CONTEXT).catch(() => undefined);
      await service.login('owner@example.com', 'Correct-horse-9', CONTEXT);

      const text = logs.join('\n');
      expect(text).toContain('login.failed');
      expect(text).toContain('req-test-0001');
      expect(text).toContain('203.0.113.7');
      expect(text).toMatch(/email#[0-9a-f]{12}/);
      expect(text).not.toContain('owner@example.com');
      expect(text).not.toContain('Wrong-password-7');
      expect(text).not.toContain('Correct-horse-9');
      expect(text).not.toMatch(/[0-9a-f]{64}/);
    });
  });

  describe('startSession', () => {
    it('opens a session for a proven account: the token once, only its hash stored', async () => {
      const account: StaffAccount = {
        id: STAFF_ID,
        organizationId: ORG,
        fullName: 'Owner',
        email: 'owner@example.com',
        role: 'admin',
        organizationName: 'Humphreys',
      };

      const session = await service.startSession(account);

      expect(session.token).toMatch(/^[0-9a-f]{64}$/);
      expect(session.staff).toEqual(account);
      expect(createSession).toHaveBeenCalledWith(STAFF_ID, hashSessionToken(session.token), expect.any(Date));
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('updateProfile', () => {
    it('answers 409 EMAIL_TAKEN when another account already uses the email', async () => {
      const updateStaffProfile = jest.fn().mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
      const moduleRef = await Test.createTestingModule({
        providers: [
          IdentityService,
          { provide: IdentityRepository, useValue: { updateStaffProfile } },
          { provide: ConfigService, useValue: { get: (): undefined => undefined } },
          { provide: LoginLimiter, useValue: {} },
          { provide: TwoFactorService, useValue: {} },
          { provide: AuditService, useValue: {} },
        ],
      }).compile();

      await expect(moduleRef.get(IdentityService).updateProfile(STAFF_ID, { fullName: 'Owner', email: 'taken@example.com' })).rejects.toMatchObject({
        status: 409,
        response: { code: 'EMAIL_TAKEN' },
      });
    });
  });

  describe('sessions', () => {
    it('knows a person only by the hash of a stored, unexpired session token', async () => {
      findStaffBySessionTokenHash.mockResolvedValue({
        id: STAFF_ID,
        organizationId: ORG,
        fullName: 'Owner',
        email: 'owner@example.com',
        role: 'admin',
        organizationName: 'Humphreys',
      });

      await expect(service.staffFromToken('abc')).resolves.toMatchObject({ id: STAFF_ID });

      expect(findStaffBySessionTokenHash).toHaveBeenCalledWith(hashSessionToken('abc'));
    });

    it('has no master token: a STAFF_TOKEN setting opens nothing', async () => {
      settings.STAFF_TOKEN = 'dev-staff-token';
      findStaffBySessionTokenHash.mockResolvedValue(null);

      await expect(service.staffFromToken('dev-staff-token')).resolves.toBeNull();

      expect(findStaffByEmail).not.toHaveBeenCalled();
      expect(findStaffBySessionTokenHash).toHaveBeenCalledWith(hashSessionToken('dev-staff-token'));
    });

    it('signs a person out everywhere', async () => {
      deleteSessionsExcept.mockResolvedValue(3);

      await expect(service.logoutAll(STAFF_ID)).resolves.toBe(3);

      expect(deleteSessionsExcept).toHaveBeenCalledWith(STAFF_ID, null);
    });

    it('purges expired sessions', async () => {
      purgeExpiredSessions.mockResolvedValue(7);

      await expect(service.purgeExpiredSessions()).resolves.toBe(7);
    });
  });

  describe('changePassword', () => {
    const input = { currentPassword: 'Correct-horse-9', newPassword: 'Another-pass-42' };

    it('signs every OTHER session out and keeps the one making the change', async () => {
      findStaffById.mockResolvedValue(owner());
      updateStaffPassword.mockResolvedValue(undefined);
      deleteSessionsExcept.mockResolvedValue(2);

      await service.changePassword(STAFF_ID, input, 'my-current-token');

      expect(updateStaffPassword).toHaveBeenCalledTimes(1);
      expect(deleteSessionsExcept).toHaveBeenCalledWith(STAFF_ID, hashSessionToken('my-current-token'));
      expect(logs.join('\n')).toContain('otherSessionsRevoked=2');
    });

    it('signs every session out when the current token is unknown', async () => {
      findStaffById.mockResolvedValue(owner());

      await service.changePassword(STAFF_ID, input);

      expect(deleteSessionsExcept).toHaveBeenCalledWith(STAFF_ID, null);
    });

    it('changes nothing and revokes nothing when the current password is wrong', async () => {
      findStaffById.mockResolvedValue(owner());

      await expect(service.changePassword(STAFF_ID, { ...input, currentPassword: 'wrong-wrong-1' }, 't')).rejects.toMatchObject({ status: 401 });

      expect(updateStaffPassword).not.toHaveBeenCalled();
      expect(deleteSessionsExcept).not.toHaveBeenCalled();
    });

    it('refuses a weak new password with PASSWORD_TOO_WEAK and the list of problems, before hashing or storing anything', async () => {
      findStaffById.mockResolvedValue(owner());

      const failure = service.changePassword(STAFF_ID, { ...input, newPassword: 'short1' }, 't');

      await expect(failure).rejects.toMatchObject({
        status: 400,
        response: {
          code: 'PASSWORD_TOO_WEAK',
          problems: ['Use at least 10 characters', 'Add a capital letter'],
        },
      });
      expect(updateStaffPassword).not.toHaveBeenCalled();
      expect(deleteSessionsExcept).not.toHaveBeenCalled();
    });

    it('answers 400 about the weak password even when the current password is also wrong (nothing is verified first)', async () => {
      findStaffById.mockResolvedValue(owner());

      await expect(service.changePassword(STAFF_ID, { currentPassword: 'wrong-wrong-1', newPassword: 'password123' }, 't')).rejects.toMatchObject({
        status: 400,
      });
    });

    it('refuses a password built from the first part of the account email', async () => {
      findStaffById.mockResolvedValue(owner());

      await expect(service.changePassword(STAFF_ID, { ...input, newPassword: 'MyOwner-Pass-77' }, 't')).rejects.toMatchObject({
        status: 400,
        response: { code: 'PASSWORD_TOO_WEAK', problems: ['Do not use the first part of your email in the password'] },
      });
    });

    it('refuses a very common password even with a number on the end', async () => {
      findStaffById.mockResolvedValue(owner());

      await expect(service.changePassword(STAFF_ID, { ...input, newPassword: 'Welcome1234' }, 't')).rejects.toMatchObject({
        response: { code: 'PASSWORD_TOO_WEAK', problems: ['This is a very common password. Choose something less guessable'] },
      });
    });
  });

  describe('assertPasswordAcceptable (shared with registration and invitations)', () => {
    it('passes a password that meets every rule', () => {
      expect(() => service.assertPasswordAcceptable('Lakeside-Morning-8', 'boss@example.com')).not.toThrow();
    });

    it('throws PASSWORD_TOO_WEAK with every problem at once', () => {
      let thrown: unknown;
      try {
        service.assertPasswordAcceptable('xyz', 'boss@example.com');
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        status: 400,
        response: { code: 'PASSWORD_TOO_WEAK', problems: ['Use at least 10 characters', 'Add a capital letter', 'Add a number'] },
      });
    });
  });

  describe('first start', () => {
    it('creates the owner from the environment when there is no staff yet', async () => {
      countStaffUsers.mockResolvedValue(0);
      getSettings.mockResolvedValue(SETTINGS);
      settings.STAFF_OWNER_EMAIL = 'Boss@Example.com';
      settings.STAFF_OWNER_PASSWORD = 'First-start-pass-1';
      insertStaffUser.mockResolvedValue({ id: STAFF_ID, organizationId: ORG, fullName: 'Owner', email: 'boss@example.com', role: 'admin', organizationName: 'Humphreys' });
      service = await build();

      await service.onModuleInit();

      expect(insertStaffUser).toHaveBeenCalledWith(ORG, 'Owner', 'boss@example.com', expect.stringMatching(/^[0-9a-f]{32}:/));
    });

    it('has no fallback password: it stops with a clear message when the environment gives none', async () => {
      countStaffUsers.mockResolvedValue(0);
      getSettings.mockResolvedValue(SETTINGS);

      await expect(service.onModuleInit()).rejects.toThrow(/STAFF_OWNER_EMAIL and STAFF_OWNER_PASSWORD/);

      expect(insertStaffUser).not.toHaveBeenCalled();
    });

    it('refuses a first password that breaks the policy, and says which rules, never the password itself', async () => {
      countStaffUsers.mockResolvedValue(0);
      getSettings.mockResolvedValue(SETTINGS);
      settings.STAFF_OWNER_EMAIL = 'boss@example.com';
      settings.STAFF_OWNER_PASSWORD = 'weakweak1';
      service = await build();

      const failure = service.onModuleInit();

      await expect(failure).rejects.toThrow(/does not meet the password policy: Use at least 10 characters; Add a capital letter/);
      await expect(failure).rejects.not.toThrow(/weakweak1/);
      expect(insertStaffUser).not.toHaveBeenCalled();
    });

    it('lets a developer machine keep the documented dev login (it contains the email name) with a warning only in NODE_ENV=development', async () => {
      countStaffUsers.mockResolvedValue(0);
      getSettings.mockResolvedValue(SETTINGS);
      settings.STAFF_OWNER_EMAIL = DEV_OWNER_EMAIL;
      settings.STAFF_OWNER_PASSWORD = DEV_OWNER_PASSWORD;
      insertStaffUser.mockResolvedValue({ id: STAFF_ID, organizationId: ORG, fullName: 'Owner', email: DEV_OWNER_EMAIL, role: 'admin', organizationName: 'Humphreys' });
      process.env.NODE_ENV = 'development';
      service = await build();

      await service.onModuleInit();

      expect(insertStaffUser).toHaveBeenCalledTimes(1);
      expect(logs.join('\n')).toMatch(/does not meet the password policy.*Allowed only because NODE_ENV=development/);
      expect(logs.join('\n')).not.toContain(DEV_OWNER_PASSWORD);
    });

    it('refuses that same dev login anywhere that is not development (tests, CI, production)', async () => {
      countStaffUsers.mockResolvedValue(0);
      getSettings.mockResolvedValue(SETTINGS);
      settings.STAFF_OWNER_EMAIL = DEV_OWNER_EMAIL;
      settings.STAFF_OWNER_PASSWORD = DEV_OWNER_PASSWORD;
      service = await build();

      await expect(service.onModuleInit()).rejects.toThrow(/does not meet the password policy/);

      expect(insertStaffUser).not.toHaveBeenCalled();
    });

    it('does nothing when staff already exist', async () => {
      countStaffUsers.mockResolvedValue(1);

      await service.onModuleInit();

      expect(insertStaffUser).not.toHaveBeenCalled();
    });
  });

  describe('the documented development login', () => {
    async function withDevOwner(): Promise<void> {
      countStaffUsers.mockResolvedValue(1);
      findStaffByEmail.mockImplementation(async (email: string) =>
        email === DEV_OWNER_EMAIL ? { ...owner(), email, passwordHash: await hashPassword(DEV_OWNER_PASSWORD) } : null,
      );
    }

    it('stops production from starting while the account still accepts the known password', async () => {
      process.env.NODE_ENV = 'production';
      await withDevOwner();

      await expect(service.onModuleInit()).rejects.toThrow(/Refusing to start/);
    });

    it('never puts the password in that message', async () => {
      process.env.NODE_ENV = 'production';
      await withDevOwner();

      const error = await service.onModuleInit().catch((e: unknown) => e);

      expect(String(error)).not.toContain(DEV_OWNER_PASSWORD);
    });

    it('only warns in development', async () => {
      process.env.NODE_ENV = 'development';
      await withDevOwner();

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(logs.join('\n')).toContain('still uses the documented development password');
    });

    it('is quiet in production once the password was changed or the account is gone', async () => {
      process.env.NODE_ENV = 'production';
      countStaffUsers.mockResolvedValue(1);
      findStaffByEmail.mockResolvedValueOnce({ ...owner(), email: DEV_OWNER_EMAIL });

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      findStaffByEmail.mockResolvedValueOnce(null);
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
