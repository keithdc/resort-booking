/**
 * @file apps/api/src/migrations/coupon-once-per-guest.spec.ts
 * Migration 046 (a coupon limited to one use per guest): additive, replayable, no address stored. The behaviour against a
 * real database is in coupon-once-per-guest.integration.spec.ts (opt-in).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(join(__dirname, '046_coupon_once_per_guest.sql'), 'utf8');
const sql = raw.replace(/^\s*--.*$/gm, '');

describe('046_coupon_once_per_guest.sql', () => {
  it('only adds: no delete, update, truncate or dropped table or column', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+\w+\s+SET\b|\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('is replayable', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS once_per_guest');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS email_key');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS discounts_once_per_guest_coupon_check');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS discount_redemptions_email_key_check');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_one_use_per_email_key');
  });

  it('leaves every existing discount unlimited', () => {
    expect(sql).toContain('once_per_guest boolean NOT NULL DEFAULT false');
  });

  it('allows the switch only on a coupon, and only a 64-character hex key (never an address)', () => {
    expect(sql).toContain(`NOT once_per_guest OR conditions @> '[{"kind":"promo_code"}]'::jsonb`);
    expect(sql).toContain("email_key ~ '^[0-9a-f]{64}$'");
  });

  it('makes the unique index partial, so rows without a key never clash', () => {
    expect(sql).toMatch(/ON discount_redemptions \(discount_id, email_key\)\s+WHERE email_key IS NOT NULL/);
  });
});
