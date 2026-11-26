/**
 * @file apps/api/src/shared/privacy/privacy-hash.ts
 * @shared Normalising an email and hashing it for the erasure ledger and the audit entry
 * @dependencies node:crypto, config/environment
 */

import { createHmac } from 'node:crypto';
import { IP_HASH_SALT_MIN_LENGTH, isProduction } from '../config/environment';

type Env = Readonly<Record<string, string | undefined>>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/** Trimmed and lower-cased: how every lookup by email compares (`lower(btrim(booker_email))`). */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A cheap shape check for a command-line argument (one "@", no spaces, at most 254 characters). Not a deliverability test. */
export function isPlausibleEmail(raw: string): boolean {
  const email = normaliseEmail(raw);
  return email.length <= 254 && EMAIL_SHAPE.test(email);
}

/**
 * The key for the ledger hash: PRIVACY_HASH_SALT, else IP_HASH_SALT. Outside development one of them is required (32+
 * characters), because an unsalted hash of an email can be reversed by trying known addresses. Changing the key later
 * means older ledger rows no longer match: keep it with the backups' key material.
 */
export function resolvePrivacySalt(env: Env): string {
  const salt = (env.PRIVACY_HASH_SALT?.trim() || env.IP_HASH_SALT?.trim()) ?? '';
  if (isProduction(env) && salt.length < IP_HASH_SALT_MIN_LENGTH) {
    throw new Error('PRIVACY_HASH_SALT (or IP_HASH_SALT) must be set to 32+ random characters to hash erased emails.');
  }
  return salt;
}

/**
 * Keyed one-way hash of a normalised email (HMAC-SHA-256, hex). The address itself is never stored in the ledger or the
 * audit log.
 */
export function subjectHash(email: string, salt: string): string {
  return createHmac('sha256', salt).update(`privacy:v1:${normaliseEmail(email)}`).digest('hex');
}
