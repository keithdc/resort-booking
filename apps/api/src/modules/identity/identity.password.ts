/**
 * @file apps/api/src/modules/identity/identity.password.ts
 * @feature identity
 * @dependencies node:crypto
 */

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEY_LEN = 64;
const SESSION_BYTES = 32;

/**
 * Stores salt and derived key as hex, separated by a colon.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  if (!Buffer.isBuffer(key)) {
    throw new Error('scrypt did not return a buffer');
  }
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/**
 * Constant-time compare of a password against a stored hash.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const separator = stored.indexOf(':');
  if (separator <= 0) {
    return false;
  }
  const salt = Buffer.from(stored.slice(0, separator), 'hex');
  const expected = Buffer.from(stored.slice(separator + 1), 'hex');
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }
  const actual = await scrypt(password, salt, expected.length);
  if (!Buffer.isBuffer(actual) || actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * Random session token shown once to the client.
 */
export function createSessionToken(): string {
  return randomBytes(SESSION_BYTES).toString('hex');
}

/**
 * Hash stored in Postgres instead of the raw token.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Prototype password floor: eight characters with a letter and a number.
 */
export function passwordIssue(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include a letter and a number';
  }
  return null;
}
