/**
 * @file apps/api/src/modules/identity/two-factor.totp.ts
 * @feature identity
 * @dependencies node:crypto
 * TOTP (RFC 6238 over HOTP, RFC 4226) with the standard library only: SHA-1, 6 digits, 30 second steps.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps either side of "now" that are still accepted (clock drift between the phone and the server). */
export const TOTP_WINDOW_STEPS = 1;
const SECRET_BYTES = 20;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A new random secret (160 bits, the size RFC 4226 recommends). */
export function generateTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

/** RFC 4648 base32 without padding, the form authenticator apps expect. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32.charAt((value << (5 - bits)) & 31);
  }
  return out;
}

/** Inverse of base32Encode; null when the text holds a character outside the alphabet. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) {
      return null;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP value for one counter (RFC 4226 dynamic truncation), zero-padded to `digits`. */
export function hotp(secret: Buffer, counter: number, digits: number = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The 30-second step a moment falls in. */
export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code an authenticator shows at `nowMs`. */
export function totpAt(secret: Buffer, nowMs: number, digits: number = TOTP_DIGITS): string {
  return hotp(secret, timeStep(nowMs), digits);
}

/** Constant-time string comparison (false for different lengths without comparing contents). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Is this the shape of an authenticator code (six digits, spaces allowed)? */
export function looksLikeTotpCode(input: string): boolean {
  return /^\d{6}$/.test(input.replace(/\s/g, ''));
}

/**
 * The step that `input` proves, or null. Every step in the window is compared (no early exit), so timing does
 * not say which step was close. Replay is NOT decided here: the caller must still record the step atomically and
 * refuse a step that is not newer than the last accepted one.
 */
export function matchTotp(secret: Buffer, input: string, nowMs: number): number | null {
  const code = input.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const current = timeStep(nowMs);
  let matched: number | null = null;
  for (let step = current - TOTP_WINDOW_STEPS; step <= current + TOTP_WINDOW_STEPS; step += 1) {
    if (safeEqual(hotp(secret, step), code) && matched === null) {
      matched = step;
    }
  }
  return matched;
}

/** The otpauth:// URI authenticator apps read (the secret is base32, the label is escaped). */
export function buildOtpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
