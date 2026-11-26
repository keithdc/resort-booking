/**
 * @file apps/api/src/modules/identity/identity.password.spec.ts
 * @feature identity
 * @dependencies identity.password
 */

import { createSessionToken, dummyPasswordHash, hashPassword, hashSessionToken, verifyPassword } from './identity.password';

describe('identity.password', (): void => {
  it('hashes and verifies a password', async (): Promise<void> => {
    const stored = await hashPassword('AtlanticOwner1!');
    await expect(verifyPassword('AtlanticOwner1!', stored)).resolves.toBe(true);
    await expect(verifyPassword('wrong-pass1', stored)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes', async (): Promise<void> => {
    await expect(verifyPassword('AtlanticOwner1!', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('AtlanticOwner1!', ':')).resolves.toBe(false);
    await expect(verifyPassword('AtlanticOwner1!', '')).resolves.toBe(false);
  });

  it('hashes session tokens without storing the raw value', (): void => {
    const token = createSessionToken();
    expect(token).toHaveLength(64);
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(`${token}x`)).not.toBe(hashSessionToken(token));
  });
});

describe('dummyPasswordHash', (): void => {
  it('is a real hash in the same format, shared by every caller', async (): Promise<void> => {
    const first = await dummyPasswordHash();

    expect(first).toMatch(/^scrypt[$]16384[$]8[$]1[$][0-9a-f]{32}[$][0-9a-f]{128}$/);
    expect(await dummyPasswordHash()).toBe(first);
  });

  it('never matches a password someone types, but still costs a full verification', async (): Promise<void> => {
    await expect(verifyPassword('Password123!', await dummyPasswordHash())).resolves.toBe(false);
  });
});
