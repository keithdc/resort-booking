/**
 * @file apps/api/src/modules/identity/two-factor.cipher.ts
 * @feature identity
 * @dependencies node:crypto, ConfigService
 * AES-256-GCM for the TOTP secret at rest, plus the recovery-code helpers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { isProduction } from '../../shared/config/environment';

const VERSION = 'v1';
const IV_BYTES = 12;
/** No ambiguous characters (0/O, 1/I/L): codes are read off a screen and typed. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;
const DEV_KEY_SEED = 'resort-booking development only two-factor key';

/**
 * Turns the setting into a 32-byte key: 64 hex characters or base64 of 32 bytes. Null when it is neither.
 */
export function parseTwoFactorKey(raw: string): Buffer | null {
  const text = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    return Buffer.from(text, 'hex');
  }
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(text)) {
    const bytes = Buffer.from(text, 'base64');
    return bytes.length === 32 ? bytes : null;
  }
  return null;
}

/** Thrown when a stored secret cannot be read with the current key or the previous one (rotated away, changed, or another person's). */
export class UnreadableTwoFactorSecretError extends Error {
  public constructor() {
    super('Unreadable two-factor secret');
    this.name = 'UnreadableTwoFactorSecretError';
  }
}

/** Prefix of a recovery-code hash made with HMAC (the older plain SHA-256 hashes have none). */
const HMAC_HASH_PREFIX = 'h2:';

/**
 * Encrypts and decrypts the TOTP secret. The ciphertext is bound to the person (the staff id is authenticated
 * data), so a stolen database row cannot be pasted onto another account. Outside production a missing key falls
 * back to a fixed development key with a warning; in production a missing or malformed key stops the start.
 *
 * Rotation (docs/13 R2-19): set the new key in TWO_FACTOR_ENCRYPTION_KEY and the old one in
 * TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS. New ciphertexts use the current key; reading tries the current key, then the
 * previous one, and `reencrypt` hands back a fresh ciphertext for a secret that still needed the previous key. Remove
 * the previous key once no staff row is left on it.
 */
@Injectable()
export class TwoFactorCipher {
  private readonly logger = new Logger('TwoFactor');
  private readonly key: Buffer;
  private readonly previousKey: Buffer | null;

  public constructor(config: ConfigService) {
    const raw = config.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ?? '';
    const previousRaw = config.get<string>('TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS') ?? '';
    if (raw.trim() === '') {
      if (isProduction(process.env)) {
        throw new Error('TWO_FACTOR_ENCRYPTION_KEY is not set (see apps/api/.env.example).');
      }
      this.logger.warn('TWO_FACTOR_ENCRYPTION_KEY is not set: using the development key. Never do this on a server.');
      this.key = createHash('sha256').update(DEV_KEY_SEED).digest();
    } else {
      const key = parseTwoFactorKey(raw);
      if (key === null) {
        throw new Error('TWO_FACTOR_ENCRYPTION_KEY must be 32 random bytes as 64 hex characters or base64.');
      }
      this.key = key;
    }
    if (previousRaw.trim() === '') {
      this.previousKey = null;
      return;
    }
    const previous = parseTwoFactorKey(previousRaw);
    if (previous === null) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS must be 32 random bytes as 64 hex characters or base64.');
    }
    this.previousKey = previous;
  }

  /** `v1:<iv>:<tag>:<ciphertext>` (base64url parts), made with the current key. */
  public encrypt(plain: Buffer, staffUserId: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(staffUserId, 'utf8'));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join(':');
  }

  /** Throws UnreadableTwoFactorSecretError when the value was changed, belongs to someone else, or was made with another key. */
  public decrypt(stored: string, staffUserId: string): Buffer {
    return this.open(stored, staffUserId).plain;
  }

  /**
   * A fresh ciphertext (current key) for a secret that could only be read with the PREVIOUS key; null when it is already
   * on the current key, or cannot be read at all.
   */
  public reencrypt(stored: string, staffUserId: string): string | null {
    try {
      const { plain, usedPreviousKey } = this.open(stored, staffUserId);
      return usedPreviousKey ? this.encrypt(plain, staffUserId) : null;
    } catch {
      return null;
    }
  }

  /**
   * What is stored for a recovery code: HMAC-SHA256 with a key derived from the 2FA key (and the person), prefixed
   * `h2:`. A leaked database alone cannot be attacked offline; the old plain SHA-256 could.
   */
  public hashRecoveryCode(input: string, staffUserId: string): string {
    return this.hmacRecoveryHash(this.key, input, staffUserId);
  }

  /**
   * Every hash a typed code may be stored under, newest first: HMAC with the current key, with the previous key (during
   * a rotation), and the old plain SHA-256 of codes issued before R2-19. Each is single use like before.
   */
  public recoveryHashCandidates(input: string, staffUserId: string): string[] {
    return [
      this.hmacRecoveryHash(this.key, input, staffUserId),
      ...(this.previousKey === null ? [] : [this.hmacRecoveryHash(this.previousKey, input, staffUserId)]),
      hashRecoveryCode(input, staffUserId),
    ];
  }

  private hmacRecoveryHash(key: Buffer, input: string, staffUserId: string): string {
    const derived = createHmac('sha256', key).update('resort-booking recovery code hash v2').digest();
    return `${HMAC_HASH_PREFIX}${createHmac('sha256', derived).update(`${staffUserId}:${normalizeRecoveryCode(input)}`).digest('hex')}`;
  }

  private open(stored: string, staffUserId: string): { plain: Buffer; usedPreviousKey: boolean } {
    const [version, iv, tag, body, ...rest] = stored.split(':');
    if (version !== VERSION || iv === undefined || tag === undefined || body === undefined || rest.length > 0) {
      throw new UnreadableTwoFactorSecretError();
    }
    const attempts: Array<{ key: Buffer; previous: boolean }> = [{ key: this.key, previous: false }];
    if (this.previousKey !== null) {
      attempts.push({ key: this.previousKey, previous: true });
    }
    for (const attempt of attempts) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', attempt.key, Buffer.from(iv, 'base64url'));
        decipher.setAAD(Buffer.from(staffUserId, 'utf8'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return { plain: Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]), usedPreviousKey: attempt.previous };
      } catch {
        // Wrong key or tampered value: try the next key.
      }
    }
    throw new UnreadableTwoFactorSecretError();
  }
}

/** One unbiased symbol: bytes at or above 248 are discarded (31 symbols divide 248 evenly). */
function randomSymbol(): string {
  let byte = 255;
  while (byte >= 248) {
    byte = randomBytes(1)[0] ?? 255;
  }
  return RECOVERY_ALPHABET.charAt(byte % RECOVERY_ALPHABET.length);
}

/** Ten fresh codes, shown once as `XXXXX-XXXXX`. */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
    let text = '';
    for (let j = 0; j < RECOVERY_LENGTH; j += 1) {
      text += randomSymbol();
    }
    codes.push(`${text.slice(0, 5)}-${text.slice(5)}`);
  }
  return codes;
}

/** Upper-case, no spaces or dashes, so "abcde-fghjk" and "ABCDEFGHJK" are the same code. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** Is this the shape of a recovery code (after normalising)? */
export function looksLikeRecoveryCode(input: string): boolean {
  const code = normalizeRecoveryCode(input);
  return code.length === RECOVERY_LENGTH && [...code].every((char): boolean => RECOVERY_ALPHABET.includes(char));
}

/**
 * The OLD stored form of a code: plain SHA-256 bound to the person. Only used to recognise codes issued before R2-19;
 * new codes are stored with `TwoFactorCipher.hashRecoveryCode`.
 */
export function hashRecoveryCode(input: string, staffUserId: string): string {
  return createHash('sha256').update(`${staffUserId}:${normalizeRecoveryCode(input)}`).digest('hex');
}
