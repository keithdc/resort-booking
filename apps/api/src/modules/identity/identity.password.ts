/**
 * @file apps/api/src/modules/identity/identity.password.ts
 * @feature identity
 * @dependencies node:crypto
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Semaphore, SemaphoreFullError } from '../../shared/concurrency/semaphore';

const scryptAsync = promisify(scryptCb);
const KEY_LEN = 64;
const SESSION_BYTES = 32;

/**
 * scrypt runs on libuv's small thread pool (4 threads by default) that the whole process shares. A flood
 * of logins must not fill it, so at most this many hashes run at once and a bounded number wait; beyond
 * that a caller gets a quick 503 instead of slowing down everyone else.
 */
const hashing = new Semaphore(3, 50);

async function scrypt(password: string, salt: Buffer, length: number): Promise<Buffer> {
  try {
    const key = await hashing.run(() => scryptAsync(password, salt, length));
    if (!Buffer.isBuffer(key)) {
      throw new Error('scrypt did not return a buffer');
    }
    return key;
  } catch (error: unknown) {
    if (error instanceof SemaphoreFullError) {
      throw new ServiceUnavailableException({
        message: 'Sign-in is busy right now. Please try again in a moment.',
        code: 'LOGIN_BUSY',
      });
    }
    throw error;
  }
}

/**
 * Stores salt and derived key as hex, separated by a colon.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
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
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

/**
 * A valid hash of a password nobody knows. Logging in as an unknown email verifies against this, so a
 * missing account costs the same time as a wrong password and the response time reveals nothing.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
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
