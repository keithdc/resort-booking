/**
 * @file apps/api/src/modules/identity/two-factor.rotation.spec.ts
 * @feature identity
 * @dependencies TwoFactorService, TwoFactorCipher
 *
 * Docs/13 R2-19: key rotation, recovery codes stored as HMACs (old plain hashes still accepted), and an unreadable
 * secret answered with a controlled 401 instead of a 500.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditService } from '../../shared/audit/audit.service';
import { IdentityRepository } from './identity.repository';
import { hashRecoveryCode, TwoFactorCipher } from './two-factor.cipher';
import { TwoFactorLimiter } from './two-factor-limiter';
import { TwoFactorRepository, type ChallengeRecord, type TwoFactorState } from './two-factor.repository';
import { TwoFactorService } from './two-factor.service';
import { hotp, timeStep } from './two-factor.totp';

const ORG = '11111111-1111-1111-1111-111111111111';
const ME = '2ae67f87-fcbf-4904-850f-a915246e0fab';
const CTX = { ip: '203.0.113.7', requestId: 'req-1' };
const OLD_KEY = 'cd'.repeat(32);
const NEW_KEY = 'ab'.repeat(32);
const SECRET = Buffer.from('12345678901234567890', 'ascii');
const CODE = 'ABCDE-FGHJK';

function cipherWith(key: string, previous?: string): TwoFactorCipher {
  return new TwoFactorCipher(new ConfigService({ TWO_FACTOR_ENCRYPTION_KEY: key, TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS: previous }));
}

describe('TwoFactorService with rotated keys and old recovery hashes', () => {
  const logs: string[] = [];
  let state: { secretEncrypted: string; hashes: string[]; lastUsedStep: number | null };
  const replaceSecret = jest.fn<Promise<boolean>, [string, string, string]>();

  async function build(cipher: TwoFactorCipher): Promise<TwoFactorService> {
    const store = {
      findChallenge: (): Promise<ChallengeRecord | null> => Promise.resolve({ id: 'c1', staffUserId: ME, organizationId: ORG, failedAttempts: 0 }),
      findState: (): Promise<TwoFactorState | null> =>
        Promise.resolve({ secretEncrypted: state.secretEncrypted, enabledAt: new Date(), lastUsedStep: state.lastUsedStep, recoveryCodeHashes: [...state.hashes] }),
      acceptStep: (_id: string, step: number): Promise<boolean> => {
        state.lastUsedStep = step;
        return Promise.resolve(true);
      },
      consumeRecoveryCode: (_id: string, hash: string): Promise<boolean> => {
        const present = state.hashes.includes(hash);
        state.hashes = state.hashes.filter((item): boolean => item !== hash);
        return Promise.resolve(present);
      },
      deleteChallenge: (): Promise<boolean> => Promise.resolve(true),
      recordChallengeFailure: (): Promise<number> => Promise.resolve(1),
      replaceSecret,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: TwoFactorRepository, useValue: store },
        { provide: TwoFactorCipher, useValue: cipher },
        { provide: TwoFactorLimiter, useValue: { assertAllowed: (): Promise<void> => Promise.resolve(), recordFailure: (): Promise<void> => Promise.resolve(), recordSuccess: (): Promise<void> => Promise.resolve() } },
        { provide: IdentityRepository, useValue: {} },
        { provide: AuditService, useValue: { record: (): Promise<boolean> => Promise.resolve(true), hashIp: (ip: string): string => `ip:${ip}` } },
      ],
    }).compile();
    return moduleRef.get(TwoFactorService);
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    logs.length = 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]): void => {
        logs.push(String(args[0]));
      });
    }
    replaceSecret.mockReset().mockResolvedValue(true);
    state = { secretEncrypted: cipherWith(OLD_KEY).encrypt(SECRET, ME), hashes: [], lastUsedStep: null };
  });

  it('signs in with a secret still encrypted under the previous key, then moves it to the current key', async () => {
    const service = await build(cipherWith(NEW_KEY, OLD_KEY));
    const before = state.secretEncrypted;

    const passed = await service.completeChallenge('token', hotp(SECRET, timeStep(Date.now())), CTX);

    expect(passed.method).toBe('totp');
    expect(replaceSecret).toHaveBeenCalledTimes(1);
    const [staffId, fresh, expected] = replaceSecret.mock.calls[0] ?? [];
    expect(staffId).toBe(ME);
    expect(expected).toBe(before);
    expect(cipherWith(NEW_KEY).decrypt(fresh ?? '', ME).equals(SECRET)).toBe(true);
  });

  it('does not touch a secret that is already on the current key', async () => {
    state.secretEncrypted = cipherWith(NEW_KEY).encrypt(SECRET, ME);
    const service = await build(cipherWith(NEW_KEY, OLD_KEY));

    await service.completeChallenge('token', hotp(SECRET, timeStep(Date.now())), CTX);

    expect(replaceSecret).not.toHaveBeenCalled();
  });

  it('still signs in when saving the re-encrypted secret fails', async () => {
    replaceSecret.mockRejectedValue(new Error('db down'));
    const service = await build(cipherWith(NEW_KEY, OLD_KEY));

    await expect(service.completeChallenge('token', hotp(SECRET, timeStep(Date.now())), CTX)).resolves.toMatchObject({ method: 'totp' });
    expect(logs.join('\n')).toContain('two_factor.rekey_failed');
  });

  it('answers 401 TWO_FACTOR_UNAVAILABLE (not a 500) when no key can read the secret, and logs an error to alert on', async () => {
    const service = await build(cipherWith(NEW_KEY));

    await expect(service.completeChallenge('token', hotp(SECRET, timeStep(Date.now())), CTX)).rejects.toMatchObject({
      status: 401,
      response: { code: 'TWO_FACTOR_UNAVAILABLE' },
    });
    expect(logs.join('\n')).toContain(`two_factor.secret_unreadable staff=${ME}`);
    expect(logs.join('\n')).not.toContain(SECRET.toString('hex'));
  });

  it('accepts a recovery code stored the OLD way (plain SHA-256), once', async () => {
    state.secretEncrypted = cipherWith(NEW_KEY).encrypt(SECRET, ME);
    state.hashes = [hashRecoveryCode(CODE, ME)];
    const service = await build(cipherWith(NEW_KEY));

    await expect(service.completeChallenge('token', CODE, CTX)).resolves.toMatchObject({ method: 'recovery' });
    await expect(service.completeChallenge('token', CODE, CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
  });

  it('accepts a recovery code stored as an HMAC under the current key and under the previous key', async () => {
    state.secretEncrypted = cipherWith(NEW_KEY).encrypt(SECRET, ME);
    const current = cipherWith(NEW_KEY);
    const service = await build(cipherWith(NEW_KEY, OLD_KEY));

    state.hashes = [current.hashRecoveryCode(CODE, ME)];
    await expect(service.completeChallenge('token', CODE, CTX)).resolves.toMatchObject({ method: 'recovery' });

    state.hashes = [cipherWith(OLD_KEY).hashRecoveryCode(CODE, ME)];
    await expect(service.completeChallenge('token', CODE, CTX)).resolves.toMatchObject({ method: 'recovery' });
  });

  it('refuses a recovery code hashed under an unrelated key', async () => {
    state.secretEncrypted = cipherWith(NEW_KEY).encrypt(SECRET, ME);
    state.hashes = [cipherWith('ef'.repeat(32)).hashRecoveryCode(CODE, ME)];
    const service = await build(cipherWith(NEW_KEY, OLD_KEY));

    await expect(service.completeChallenge('token', CODE, CTX)).rejects.toMatchObject({ response: { code: 'TWO_FACTOR_CODE_INVALID' } });
  });
});
