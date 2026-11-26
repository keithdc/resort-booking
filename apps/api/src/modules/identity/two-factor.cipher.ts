/**
 * @file apps/api/src/modules/identity/two-factor.cipher.ts
 * @feature identity
 * @dependencies node:crypto, ConfigService
 * AES-256-GCM for the TOTP secret at rest, plus the recovery-code helpers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
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

/**
 * Encrypts and decrypts the TOTP secret. The ciphertext is bound to the person (the staff id is authenticated
 * data), so a stolen database row cannot be pasted onto another account. Outside production a missing key falls
 * back to a fixed development key with a warning; in production a missing or malformed key stops the start.
 */
@Injectable()
export class TwoFactorCipher {
  private readonly logger = new Logger('TwoFactor');
  private readonly key: Buffer;

  public constructor(config: ConfigService) {
    const raw = config.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ?? '';
    if (raw.trim() === '') {
      if (isProduction(process.env)) {
        throw new Error('TWO_FACTOR_ENCRYPTION_KEY is not set (see apps/api/.env.example).');
      }
      this.logger.warn('TWO_FACTOR_ENCRYPTION_KEY is not set: using the development key. Never do this on a server.');
      this.key = createHash('sha256').update(DEV_KEY_SEED).digest();
      return;
    }
    const key = parseTwoFactorKey(raw);
    if (key === null) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY must be 32 random bytes as 64 hex characters or base64.');
    }
    this.key = key;
  }

  /** `v1:<iv>:<tag>:<ciphertext>` (base64url parts). */
  public encrypt(plain: Buffer, staffUserId: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(staffUserId, 'utf8'));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join(':');
  }

  /** Throws when the value was changed, belongs to someone else, or was made with another key. */
  public decrypt(stored: string, staffUserId: string): Buffer {
    const [version, iv, tag, body, ...rest] = stored.split(':');
    if (version !== VERSION || iv === undefined || tag === undefined || body === undefined || rest.length > 0) {
      throw new Error('Unreadable two-factor secret');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(staffUserId, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
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

/** What is stored for a code. The codes are random (50 bits), so a plain SHA-256 bound to the person is enough. */
export function hashRecoveryCode(input: string, staffUserId: string): string {
  return createHash('sha256').update(`${staffUserId}:${normalizeRecoveryCode(input)}`).digest('hex');
}
