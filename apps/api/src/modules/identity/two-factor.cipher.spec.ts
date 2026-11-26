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
} from './two-factor.cipher';

const HEX_KEY = 'ab'.repeat(32);
const USER = '2ae67f87-fcbf-4904-850f-a915246e0fab';

function cipherWith(key: string | undefined): TwoFactorCipher {
  const config = { get: (name: string): string | undefined => (name === 'TWO_FACTOR_ENCRYPTION_KEY' ? key : undefined) } as ConfigService;
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
