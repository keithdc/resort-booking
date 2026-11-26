/**
 * @file apps/api/src/modules/identity/two-factor.cipher.spec.ts
 * @feature identity
 * Encryption round trip, key handling and recovery-code helpers.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  normalizeRecoveryCode,
  parseTwoFactorKey,
  RECOVERY_CODE_COUNT,
  TwoFactorCipher,
  UnreadableTwoFactorSecretError,
} from './two-factor.cipher';

const HEX_KEY = 'ab'.repeat(32);
const USER = '2ae67f87-fcbf-4904-850f-a915246e0fab';

function cipherWith(key: string | undefined, previous?: string): TwoFactorCipher {
  const values: Record<string, string | undefined> = { TWO_FACTOR_ENCRYPTION_KEY: key, TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS: previous };
  const config = { get: (name: string): string | undefined => values[name] } as ConfigService;
  return new TwoFactorCipher(config);
}

describe('TwoFactorCipher', () => {
  const before = process.env.NODE_ENV;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (before === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = before;
    }
  });

  it('round trips a secret and never stores it readable', () => {
    const cipher = cipherWith(HEX_KEY);
    const secret = Buffer.from('12345678901234567890', 'ascii');

    const stored = cipher.encrypt(secret, USER);

    expect(stored).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain(secret.toString('base64url'));
    expect(cipher.decrypt(stored, USER).equals(secret)).toBe(true);
  });

  it('uses a fresh IV each time', () => {
    const cipher = cipherWith(HEX_KEY);
    const secret = Buffer.from('same secret', 'ascii');
    expect(cipher.encrypt(secret, USER)).not.toBe(cipher.encrypt(secret, USER));
  });

  it('refuses a value pasted onto another account (the person is authenticated data)', () => {
    const cipher = cipherWith(HEX_KEY);
    const stored = cipher.encrypt(Buffer.from('secret'), USER);
    expect(() => cipher.decrypt(stored, 'someone-else')).toThrow();
  });

  it('refuses a tampered value, a foreign key and malformed text', () => {
    const cipher = cipherWith(HEX_KEY);
    const stored = cipher.encrypt(Buffer.from('secret'), USER);
    const [version, iv, tag, body] = stored.split(':');
    const flipped = `${version ?? ''}:${iv ?? ''}:${tag ?? ''}:${Buffer.from('tampered').toString('base64url')}`;

    expect(() => cipher.decrypt(flipped, USER)).toThrow();
    expect(() => cipherWith('cd'.repeat(32)).decrypt(`${version ?? ''}:${iv ?? ''}:${tag ?? ''}:${body ?? ''}`, USER)).toThrow();
    expect(() => cipher.decrypt('garbage', USER)).toThrow('Unreadable');
    expect(() => cipher.decrypt('v2:a:b:c', USER)).toThrow('Unreadable');
  });

  it('accepts a base64 key of 32 bytes too', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const cipher = cipherWith(key);
    expect(cipher.decrypt(cipher.encrypt(Buffer.from('x'), USER), USER).toString()).toBe('x');
  });

  it('rejects a malformed key', () => {
    expect(() => cipherWith('too-short')).toThrow('TWO_FACTOR_ENCRYPTION_KEY');
    expect(parseTwoFactorKey('zz'.repeat(32))).toBeNull();
    expect(parseTwoFactorKey(HEX_KEY)).toHaveLength(32);
  });

  it('falls back to a development key with a warning outside production', () => {
    process.env.NODE_ENV = 'development';
    const cipher = cipherWith(undefined);
    expect(cipher.decrypt(cipher.encrypt(Buffer.from('x'), USER), USER).toString()).toBe('x');
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('refuses to start in production without a key', () => {
    process.env.NODE_ENV = 'production';
    expect(() => cipherWith(undefined)).toThrow('TWO_FACTOR_ENCRYPTION_KEY is not set');
    expect(() => cipherWith('   ')).toThrow('TWO_FACTOR_ENCRYPTION_KEY is not set');
  });

  it('never uses the development key when NODE_ENV is unset or not development/test (fail safe)', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => cipherWith(undefined)).toThrow('TWO_FACTOR_ENCRYPTION_KEY is not set');
    delete process.env.NODE_ENV;
    expect(() => cipherWith(undefined)).toThrow('TWO_FACTOR_ENCRYPTION_KEY is not set');
  });
});

describe('recovery codes', () => {
  it('makes ten distinct codes shaped XXXXX-XXXXX from an unambiguous alphabet', () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
      expect(looksLikeRecoveryCode(code)).toBe(true);
    }
  });

  it('treats case, dashes and spaces as the same code', () => {
    expect(normalizeRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(hashRecoveryCode('abcde-fghjk', USER)).toBe(hashRecoveryCode('ABCDEFGHJK', USER));
  });

  it('hashes per person, and the hash is not the code', () => {
    const hash = hashRecoveryCode('ABCDE-FGHJK', USER);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(hashRecoveryCode('ABCDE-FGHJK', 'someone-else'));
    expect(hash).not.toContain('ABCDE');
  });

  it('rejects things that are not recovery codes', () => {
    expect(looksLikeRecoveryCode('123456')).toBe(false);
    expect(looksLikeRecoveryCode('ABCDE-FGHJ')).toBe(false);
    expect(looksLikeRecoveryCode('ABCDE-FGHJ0')).toBe(false);
    expect(looksLikeRecoveryCode('')).toBe(false);
  });
});

describe('key rotation (docs/13 R2-19)', () => {
  const OLD_KEY = 'ab'.repeat(32);
  const NEW_KEY = 'cd'.repeat(32);
  const secret = Buffer.from('12345678901234567890', 'ascii');

  it('reads a secret made with the previous key, and says it should be re-encrypted', () => {
    const stored = cipherWith(OLD_KEY).encrypt(secret, USER);
    const rotated = cipherWith(NEW_KEY, OLD_KEY);

    expect(rotated.decrypt(stored, USER).equals(secret)).toBe(true);
    const fresh = rotated.reencrypt(stored, USER);
    expect(fresh).not.toBeNull();
    expect(fresh).not.toBe(stored);
    expect(cipherWith(NEW_KEY).decrypt(fresh ?? '', USER).equals(secret)).toBe(true);
  });

  it('has nothing to re-encrypt for a secret already on the current key or one nobody can read', () => {
    const rotated = cipherWith(NEW_KEY, OLD_KEY);

    expect(rotated.reencrypt(rotated.encrypt(secret, USER), USER)).toBeNull();
    expect(rotated.reencrypt('garbage', USER)).toBeNull();
    expect(rotated.reencrypt(cipherWith('ef'.repeat(32)).encrypt(secret, USER), USER)).toBeNull();
  });

  it('writes new secrets with the current key only', () => {
    const stored = cipherWith(NEW_KEY, OLD_KEY).encrypt(secret, USER);

    expect(() => cipherWith(OLD_KEY).decrypt(stored, USER)).toThrow(UnreadableTwoFactorSecretError);
    expect(cipherWith(NEW_KEY).decrypt(stored, USER).equals(secret)).toBe(true);
  });

  it('throws the typed error when no key reads the value (a rotated-away key)', () => {
    const stored = cipherWith(OLD_KEY).encrypt(secret, USER);

    expect(() => cipherWith(NEW_KEY).decrypt(stored, USER)).toThrow(UnreadableTwoFactorSecretError);
    expect(() => cipherWith(NEW_KEY, 'ef'.repeat(32)).decrypt(stored, USER)).toThrow(UnreadableTwoFactorSecretError);
  });

  it('refuses a malformed previous key', () => {
    expect(() => cipherWith(NEW_KEY, 'short')).toThrow('TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS');
  });
});

describe('recovery code hashes (docs/13 R2-19)', () => {
  const cipher = cipherWith(HEX_KEY);

  it('are HMACs bound to the key and the person, stable across spelling', () => {
    const hash = cipher.hashRecoveryCode('abcde-fghjk', USER);

    expect(hash).toMatch(/^h2:[0-9a-f]{64}$/);
    expect(hash).toBe(cipher.hashRecoveryCode('ABCDEFGHJK', USER));
    expect(hash).not.toBe(cipher.hashRecoveryCode('ABCDEFGHJK', 'someone-else'));
    expect(hash).not.toBe(cipherWith('cd'.repeat(32)).hashRecoveryCode('ABCDEFGHJK', USER));
    expect(hash).not.toBe(hashRecoveryCode('ABCDEFGHJK', USER));
  });

  it('are not recomputable from the code and the person alone (the point of the key)', () => {
    expect(cipher.hashRecoveryCode('ABCDEFGHJK', USER)).not.toContain(hashRecoveryCode('ABCDEFGHJK', USER));
  });

  it('offers the current, the previous-key and the old plain hash as candidates, newest first', () => {
    const rotated = cipherWith('cd'.repeat(32), HEX_KEY);

    expect(rotated.recoveryHashCandidates('ABCDEFGHJK', USER)).toEqual([
      rotated.hashRecoveryCode('ABCDEFGHJK', USER),
      cipher.hashRecoveryCode('ABCDEFGHJK', USER),
      hashRecoveryCode('ABCDEFGHJK', USER),
    ]);
    expect(cipher.recoveryHashCandidates('ABCDEFGHJK', USER)).toEqual([
      cipher.hashRecoveryCode('ABCDEFGHJK', USER),
      hashRecoveryCode('ABCDEFGHJK', USER),
    ]);
  });
});
