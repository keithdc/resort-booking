/**
 * @file apps/api/src/migrations/booking-source.spec.ts
 * Migration 045 (where a booking came from): additive, replayable, guarded, and nothing personal added to the report view.
 * The behaviour against a real database is in booking-source.integration.spec.ts (opt-in).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(join(__dirname, '045_booking_source.sql'), 'utf8');
const sql = raw.replace(/^\s*--.*$/gm, '');

describe('045_booking_source.sql', () => {
  it('only adds: no delete, truncate or dropped table or column; its one row rewrite is the staff-made backfill', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+(TABLE|COLUMN)\b/i);
    const updates = sql.match(/\bUPDATE\s+\w+\s+SET\b[^;]*;/gi) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("booking_source = 'phone_email'");
    expect(updates[0]).toContain('created_by_staff_id IS NOT NULL');
  });

  it('is replayable', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS booking_source');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS inventory_blocks_booking_source_check');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS inventory_blocks_channel_payment_needs_channel_source');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS inventory_blocks_channel_reservation_is_paid_by_channel');
    expect(sql).toContain('CREATE OR REPLACE VIEW report_bookings');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS inventory_blocks_source_idx');
  });

  it('lists the six sources and defaults the column to the guest checkout', () => {
    expect(sql).toContain("booking_source text NOT NULL DEFAULT 'website'");
    expect(sql).toContain("CHECK (booking_source IN ('website', 'airbnb', 'booking_com', 'other_site', 'phone_email', 'walk_in'))");
  });

  it('adds paid_by_channel to the payment methods and ties it to the channel sources both ways', () => {
    expect(sql).toContain("CHECK (payment_method IN ('card', 'bank_transfer', 'pay_at_hotel', 'paid_by_channel'))");
    expect(sql).toContain("payment_method IS DISTINCT FROM 'paid_by_channel' OR booking_source IN ('airbnb', 'booking_com', 'other_site')");
    expect(sql).toContain("kind <> 'reservation' OR booking_source NOT IN ('airbnb', 'booking_com', 'other_site') OR payment_method = 'paid_by_channel'");
  });

  it('appends only the source to the report view, which stays free of any guest detail', () => {
    const view = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW report_bookings'));
    expect(view).toContain('booking_source');
    expect(view).not.toMatch(/booker_|guest_note|created_by_staff_id|policy_snapshot|price_snapshot/);
  });
});
