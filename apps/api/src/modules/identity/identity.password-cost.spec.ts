/**
 * @file apps/api/src/modules/identity/identity.password-cost.spec.ts
 * @feature identity
 * @dependencies identity.password
 *
 * Stored hash format and cost (docs/13 R2-27) and the per-network hashing cap (R2-18).
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { hashPassword, MAX_HASHES_PER_SOURCE, passwordNeedsRehash, TARGET_SCRYPT_PARAMS, verifyPassword } from './identity.password';

/** A hash exactly as the first version of this feature stored it: `saltHex:keyHex`, Node's default cost. */
function legacyHash(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

/** A hash with chosen parameters in the current format. */
function parameterised(password: string, n: number, r: number, p: number): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: n, r, p, maxmem: 700 * 1024 * 1024 });
  return ['scrypt', String(n), String(r), String(p), salt.toString('hex'), key.toString('hex')].join('$');
}

describe('stored hash format and cost (docs/13 R2-27)', (): void => {
  it('writes the parameters into every new hash', async (): Promise<void> => {
    const stored = await hashPassword('AtlanticOwner1!');

    const prefix = ['scrypt', String(TARGET_SCRYPT_PARAMS.N), String(TARGET_SCRYPT_PARAMS.r), String(TARGET_SCRYPT_PARAMS.p)].join('$');
    expect(stored.startsWith(`${prefix}$`)).toBe(true);
    expect(passwordNeedsRehash(stored)).toBe(false);
  });

  it('still verifies a hash in the old format, and flags it for an upgrade', async (): Promise<void> => {
    const stored = legacyHash('AtlanticOwner1!');

    await expect(verifyPassword('AtlanticOwner1!', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong-pass1', stored)).resolves.toBe(false);
    expect(passwordNeedsRehash(stored)).toBe(true);
  });

  it('verifies a hash made with a higher cost than the target and does not flag it', async (): Promise<void> => {
    const stored = parameterised('AtlanticOwner1!', 262144, 8, 1);

    await expect(verifyPassword('AtlanticOwner1!', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong-pass1', stored)).resolves.toBe(false);
    expect(passwordNeedsRehash(stored)).toBe(false);
  });

  it('flags a hash made with a lower cost than the target', (): void => {
    expect(passwordNeedsRehash(parameterised('AtlanticOwner1!', 8192, 8, 1))).toBe(true);
  });

  it('raises the cost to N=2^17 (128 MiB per hash) and flags every hash made with the earlier default (N=2^14)', async (): Promise<void> => {
    expect(TARGET_SCRYPT_PARAMS).toEqual({ N: 131072, r: 8, p: 1 });
    const earlier = parameterised('AtlanticOwner1!', 16384, 8, 1);
    await expect(verifyPassword('AtlanticOwner1!', earlier)).resolves.toBe(true);
    expect(passwordNeedsRehash(earlier)).toBe(true);
  });

  it.each([
    ['not a power of two', 'scrypt$16000$8$1$aa$bb'],
    ['absurd memory (N 2^30)', 'scrypt$1073741824$8$1$aa$bb'],
    ['r of zero', 'scrypt$16384$0$1$aa$bb'],
    ['p too high', 'scrypt$16384$8$99$aa$bb'],
    ['non-hex salt', 'scrypt$16384$8$1$zz$bb'],
    ['missing key', 'scrypt$16384$8$1$aa$'],
  ])('refuses a corrupt stored hash (%s) without running scrypt', async (_label, stored): Promise<void> => {
    await expect(verifyPassword('AtlanticOwner1!', stored)).resolves.toBe(false);
    expect(passwordNeedsRehash(stored)).toBe(false);
  });
});

describe('one network cannot fill the hashing queue (docs/13 R2-18)', (): void => {
  it('refuses a network beyond its own cap with 503 LOGIN_BUSY while another network is still served', async (): Promise<void> => {
    const stored = await hashPassword('AtlanticOwner1!');
    const flood = Array.from(
      { length: MAX_HASHES_PER_SOURCE + 4 },
      (): Promise<boolean | string> =>
        verifyPassword('guess-guess-1', stored, '203.0.113.9').catch((error: unknown): string => (error instanceof Error ? error.message : 'error')),
    );
    const other = verifyPassword('AtlanticOwner1!', stored, '198.51.100.4');

    const results = await Promise.all(flood);
    await expect(other).resolves.toBe(true);

    expect(results.filter((result): boolean => result === false)).toHaveLength(MAX_HASHES_PER_SOURCE);
    expect(results.filter((result): boolean => typeof result === 'string')).toHaveLength(4);
  });

  it('frees the network slot after each hash, so a later sign-in from the same network works', async (): Promise<void> => {
    const stored = await hashPassword('AtlanticOwner1!');

    await verifyPassword('wrong-pass1', stored, '203.0.113.20');
    await verifyPassword('wrong-pass1', stored, '203.0.113.20');

    await expect(verifyPassword('AtlanticOwner1!', stored, '203.0.113.20')).resolves.toBe(true);
  });
});
