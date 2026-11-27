/**
 * @file apps/api/src/modules/discounts/guest-email-key.ts
 * @feature discounts
 * @dependencies node:crypto, ConfigService, config/environment
 *
 * "Once per guest" means once per EMAIL, because guests have no accounts. The key is a keyed hash (HMAC-SHA-256) of a
 * normalised email, so the same person typing `Grace.Hopper+deal@Gmail.com` and `gracehopper@googlemail.com` is one
 * guest, and the database never holds the address for this purpose. Someone with a genuinely different address is a
 * different guest: that residual risk is accepted (docs/13 R7-02).
 */

import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveIpHashSalt } from '../../shared/config/environment';

/** These two names are the same mailbox. */
const GMAIL_DOMAINS: ReadonlySet<string> = new Set(['gmail.com', 'googlemail.com']);

/**
 * The address a "once per guest" limit compares: trimmed, Unicode-normalised (NFKC), lower-cased, the "+tag" part of the
 * name before the "@" removed, and for Gmail the dots removed and googlemail.com read as gmail.com. Other providers keep
 * their dots (a dot can matter there). Text that is not shaped like an address is returned trimmed and lower-cased.
 */
export function normaliseGuestEmail(raw: string): string {
  const email = raw.normalize('NFKC').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) {
    return email;
  }
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf('+');
  // "+deal@x.com" has no name before the plus: keep it whole instead of folding every such address into one.
  if (plus > 0) {
    local = local.slice(0, plus);
  }
  if (GMAIL_DOMAINS.has(domain)) {
    domain = 'gmail.com';
    const dotless = local.replace(/\./g, '');
    local = dotless === '' ? local : dotless;
  }
  return `${local}@${domain}`;
}

/** The 64-character hex key for an email under `salt`. Pure, so it is tested without Nest. */
export function guestEmailKey(raw: string, salt: string): string {
  return createHmac('sha256', salt).update(`guest-email:v1:${normaliseGuestEmail(raw)}`).digest('hex');
}

@Injectable()
export class GuestEmailKeyService {
  private readonly salt: string;

  public constructor(config: ConfigService) {
    // The same secret as the IP and email hashes of the audit log (IP_HASH_SALT): required outside development, so a
    // server never runs with an unsalted, guessable key. A different message prefix keeps the two uses apart.
    this.salt = resolveIpHashSalt(config.get<string>('IP_HASH_SALT'));
  }

  public keyFor(email: string): string {
    return guestEmailKey(email, this.salt);
  }
}
