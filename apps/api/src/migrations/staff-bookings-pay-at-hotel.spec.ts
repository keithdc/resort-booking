/**
 * @file apps/api/src/migrations/staff-bookings-pay-at-hotel.spec.ts
 * Migration 040: additive, replayable, and the guards say what docs/14 promises. The behaviour against a real database
 * is in staff-bookings.integration.spec.ts (opt-in).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '040_staff_bookings_pay_at_hotel.sql'), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

describe('040_staff_bookings_pay_at_hotel.sql', () => {
  it('never deletes, truncates or rewrites a row', () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+\w+\s+SET\b|\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('adds the columns replayably, with every existing booking counted as paid', () => {
    expect(code).toContain("ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid'");
    expect(code).toContain('ADD COLUMN IF NOT EXISTS paid_at timestamptz');
    expect(code).toContain('ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES staff_users (id)');
    expect(code).toContain('ADD COLUMN IF NOT EXISTS marked_paid_by_staff_id uuid REFERENCES staff_users (id)');
  });

  it('widens the payment method list by one value and drops only constraints it re-adds', () => {
    expect(code).toContain("CHECK (payment_method IN ('card', 'bank_transfer', 'pay_at_hotel'))");
    const dropped = code.match(/DROP CONSTRAINT IF EXISTS (\w+)/g) ?? [];
    for (const drop of dropped) {
      const name = drop.replace('DROP CONSTRAINT IF EXISTS ', '');
      expect(code).toContain(`ADD CONSTRAINT ${name}`);
    }
  });

  it('keeps a pending booking unpaid and a pay-at-hotel one', () => {
    expect(code).toContain("payment_status = 'paid' OR (payment_method = 'pay_at_hotel' AND COALESCE(paid_cents, 0) = 0 AND paid_at IS NULL)");
  });

  it('only lets payment status move from pending to paid, with a time', () => {
    expect(code).toContain("OLD.payment_status = 'paid' AND NEW.payment_status = 'pending'");
    expect(code).toContain("OLD.payment_status = 'pending' AND NEW.payment_status = 'paid' AND NEW.paid_at IS NULL");
    expect(code).toContain('DROP TRIGGER IF EXISTS inventory_blocks_payment_status_guard');
  });
});
