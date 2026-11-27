/**
 * @file apps/api/src/modules/identity/identity.password.ts
 * @feature identity
 * @dependencies node:crypto
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { Semaphore, SemaphoreFullError } from '../../shared/concurrency/semaphore';

const KEY_LEN = 64;
const SESSION_BYTES = 32;

/** scrypt cost parameters as stored with a hash. */
export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/**
 * The cost of NEW hashes: N=2^17, r=8, p=1 (the OWASP recommendation): 128 MiB of memory per hash and about eight times
 * the CPU of Node's defaults (measured on a laptop: about 150 ms per hash instead of 20 ms). Hashes made earlier keep
 * working, because a stored hash carries its own parameters (`scrypt$N$r$p$salt$key`); `passwordNeedsRehash` finds them
 * on the next successful sign-in and the caller saves a stronger one. Nobody is locked out, nothing is migrated in bulk.
 * Memory budget: the queue below lets 3 hashes run at once, so about 3 x 128 MiB = 384 MiB at the peak (docs/13 R6-04).
 */
export const TARGET_SCRYPT_PARAMS: ScryptParams = { N: 131072, r: 8, p: 1 };

/** A stored value with a bigger cost than this is treated as corrupt, so a bad row cannot make one login allocate gigabytes. */
const MAX_STORED_N = 2 ** 20;
const MAX_STORED_R = 32;
const MAX_STORED_P = 16;
const PARAMETERISED = /^scrypt\$(\d{1,8})\$(\d{1,3})\$(\d{1,3})\$([0-9a-f]+)\$([0-9a-f]+)$/;

/** At most this many hashes of ONE network may run or wait at once; the rest of the shared queue stays free for others. */
export const MAX_HASHES_PER_SOURCE = 3;

/**
 * scrypt runs on libuv's small thread pool (4 threads by default) that the whole process shares. A flood
 * of logins must not fill it, so at most this many hashes run at once and a bounded number wait; beyond
 * that a caller gets a quick 503 instead of slowing down everyone else.
 */
const hashing = new Semaphore(3, 50);
const inFlightBySource = new Map<string, number>();

function deriveKey(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject): void => {
    scryptCb(password, salt, length, options, (error: Error | null, key: Buffer): void => {
      if (error !== null) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 2 && (value & (value - 1)) === 0;
}

/** Memory scrypt needs (128 * N * r bytes) plus headroom, so Node's 32 MiB default limit never refuses a valid cost. */
function maxMemoryFor(params: ScryptParams): number {
  return 128 * params.N * params.r * 2 + 1024 * 1024;
}

function busyError(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Sign-in is busy right now. Please try again in a moment.',
    code: 'LOGIN_BUSY',
  });
}

function releaseSource(source: string): void {
  const left = (inFlightBySource.get(source) ?? 1) - 1;
  if (left <= 0) {
    inFlightBySource.delete(source);
  } else {
    inFlightBySource.set(source, left);
  }
}

async function scrypt(password: string, salt: Buffer, length: number, params: ScryptParams, source?: string): Promise<Buffer> {
  // One network cannot fill the shared queue: its own jobs beyond the cap are refused first.
  if (source !== undefined) {
    const inFlight = inFlightBySource.get(source) ?? 0;
    if (inFlight >= MAX_HASHES_PER_SOURCE) {
      throw busyError();
    }
    inFlightBySource.set(source, inFlight + 1);
  }
  try {
    return await hashing.run(() => deriveKey(password, salt, length, { ...params, maxmem: maxMemoryFor(params) }));
  } catch (error: unknown) {
    if (error instanceof SemaphoreFullError) {
      throw busyError();
    }
    throw error;
  } finally {
    if (source !== undefined) {
      releaseSource(source);
    }
  }
}

/**
 * Stores the parameters, salt and derived key: `scrypt$N$r$p$saltHex$keyHex`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, TARGET_SCRYPT_PARAMS);
  const { N, r, p } = TARGET_SCRYPT_PARAMS;
  return `scrypt$${String(N)}$${String(r)}$${String(p)}$${salt.toString('hex')}$${key.toString('hex')}`;
}

interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
  legacy: boolean;
}

/** Reads both formats: the current one and the older `saltHex:keyHex` made with Node's defaults. Null when unreadable. */
function parseStoredHash(stored: string): ParsedHash | null {
  const current = PARAMETERISED.exec(stored);
  if (current !== null) {
    const params: ScryptParams = { N: Number(current[1]), r: Number(current[2]), p: Number(current[3]) };
    const withinBounds =
      isPowerOfTwo(params.N) && params.N <= MAX_STORED_N && params.r >= 1 && params.r <= MAX_STORED_R && params.p >= 1 && params.p <= MAX_STORED_P;
    return withinBounds ? { params, salt: Buffer.from(current[4] ?? '', 'hex'), key: Buffer.from(current[5] ?? '', 'hex'), legacy: false } : null;
  }
  const separator = stored.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  return {
    params: { N: 16384, r: 8, p: 1 },
    salt: Buffer.from(stored.slice(0, separator), 'hex'),
    key: Buffer.from(stored.slice(separator + 1), 'hex'),
    legacy: true,
  };
}

/**
 * Constant-time compare of a password against a stored hash. `source` (the caller's network key) lets the hashing queue
 * refuse one network's surplus before it crowds out others; leave it out for work not driven by anonymous callers.
 */
export async function verifyPassword(password: string, stored: string, source?: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (parsed === null || parsed.salt.length === 0 || parsed.key.length === 0) {
    return false;
  }
  const actual = await scrypt(password, parsed.salt, parsed.key.length, parsed.params, source);
  if (actual.length !== parsed.key.length) {
    return false;
  }
  return timingSafeEqual(actual, parsed.key);
}

/**
 * True when a stored hash is in the old format or was made with weaker parameters than TARGET_SCRYPT_PARAMS: the caller
 * re-hashes the password it just verified and saves the result.
 */
export function passwordNeedsRehash(stored: string): boolean {
  const parsed = parseStoredHash(stored);
  return (
    parsed !== null &&
    (parsed.legacy ||
      parsed.params.N < TARGET_SCRYPT_PARAMS.N ||
      parsed.params.r < TARGET_SCRYPT_PARAMS.r ||
      parsed.params.p < TARGET_SCRYPT_PARAMS.p)
  );
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
