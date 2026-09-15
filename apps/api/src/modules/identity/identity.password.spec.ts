/**
 * @file apps/api/src/modules/identity/identity.password.spec.ts
 * @feature identity
 * @dependencies identity.password
 */

import { createSessionToken, hashPassword, hashSessionToken, passwordIssue, verifyPassword } from './identity.password';

describe('identity.password', (): void => {
  it('rejects short passwords', (): void => {
    expect(passwordIssue('Ab1')).toBe('Password must be at least 8 characters');
  });

  it('rejects passwords without a letter or a number', (): void => {
    expect(passwordIssue('abcdefgh')).toBe('Password must include a letter and a number');
    expect(passwordIssue('12345678')).toBe('Password must include a letter and a number');
  });

  it('accepts an eight-character mixed password', (): void => {
    expect(passwordIssue('Atlantic1')).toBeNull();
  });

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
