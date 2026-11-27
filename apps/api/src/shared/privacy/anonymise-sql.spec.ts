/**
 * @file apps/api/src/shared/privacy/anonymise-sql.spec.ts
 * @shared What the anonymising statement clears, so a new personal column is not forgotten (the behaviour against a real
 * database is in privacy.integration.spec.ts and migrations/coupon-once-per-guest.integration.spec.ts, both opt-in)
 */

import { anonymiseBookingsSql } from './anonymise-sql';

const sql = anonymiseBookingsSql('SELECT ib.id FROM inventory_blocks ib WHERE ib.id = ANY($3::uuid[])');

describe('anonymiseBookingsSql', () => {
  it('clears the once-per-guest email key of the booking\'s discount rows, and counts them', () => {
    expect(sql).toContain('UPDATE discount_redemptions dr SET email_key = NULL');
    expect(sql).toContain('dr.inventory_block_id IN (SELECT id FROM done)');
    expect(sql).toContain('AS email_keys');
  });

  it('still removes the email, phone and notes of the booking', () => {
    expect(sql).toContain('booker_email = NULL');
    expect(sql).toContain('booker_phone = NULL');
    expect(sql).toContain("guest_note = ''");
  });
});
