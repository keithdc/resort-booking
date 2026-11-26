/**
 * @file apps/api/src/migrations/reservation-extras.spec.ts
 * Migrations 041 (extras on a booking) and 042 (report view): additive, replayable, and the guards say what docs/04 and
 * docs/14 promise. The behaviour against a real database is in staff-bookings.integration.spec.ts (opt-in).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (file: string): string => readFileSync(join(__dirname, file), 'utf8').replace(/^\s*--.*$/gm, '');
const extras = strip('041_reservation_extras.sql');
const view = strip('042_report_payment_status.sql');

describe('041_reservation_extras.sql', () => {
  it('only adds: no delete, truncate, update of rows or dropped table or column', () => {
    expect(extras).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+\w+\s+SET\b|\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('is replayable', () => {
    expect(extras).toContain('CREATE TABLE IF NOT EXISTS reservation_extras');
    expect(extras).toContain('CREATE INDEX IF NOT EXISTS reservation_extras_booking_idx');
    expect(extras).toContain('CREATE UNIQUE INDEX IF NOT EXISTS inventory_blocks_id_organization_key');
    expect(extras).toContain('DROP TRIGGER IF EXISTS reservation_extras_guard');
    expect(extras).toContain('CREATE OR REPLACE FUNCTION resort_guard_reservation_extras');
  });

  it('keeps a copy of what was offered, with money in whole cents and a bounded quantity', () => {
    for (const column of ['name text NOT NULL', 'kind text NOT NULL', 'unit_price_cents integer NOT NULL', 'line_cents integer NOT NULL', 'currency_code text NOT NULL']) {
      expect(extras).toContain(column);
    }
    expect(extras).toContain('CHECK (quantity BETWEEN 1 AND 20)');
    expect(extras).toContain('CHECK (unit_price_cents >= 0)');
    expect(extras).toContain('CHECK (line_cents >= 0)');
  });

  it('lets an instant extra charge price x quantity and a request charge nothing', () => {
    expect(extras).toContain("kind = 'instant' AND line_cents = unit_price_cents * quantity AND status = 'confirmed'");
    expect(extras).toContain("kind = 'on_request' AND line_cents = 0 AND status IN ('pending', 'declined')");
  });

  it('ties the extra to the booking and the property of the SAME organization, and lets the catalog link go empty', () => {
    expect(extras).toContain('FOREIGN KEY (inventory_block_id, organization_id) REFERENCES inventory_blocks (id, organization_id)');
    expect(extras).toContain('FOREIGN KEY (property_id, organization_id) REFERENCES properties (id, organization_id)');
    expect(extras).toContain('extra_service_id uuid REFERENCES extra_services (id) ON DELETE SET NULL');
  });

  it('fixes the price, quantity, name and booking after saving, refuses DELETE, and keeps the owner-run escape hatch', () => {
    for (const column of ['inventory_block_id', 'name', 'kind', 'quantity', 'unit_price_cents', 'line_cents', 'currency_code']) {
      expect(extras).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`);
    }
    expect(extras).toContain("current_setting('resort.record_maintenance', true)");
    expect(extras).toContain("TG_OP = 'DELETE'");
  });
});

describe('042_report_payment_status.sql', () => {
  it('only replaces the view, appending payment status and paid time and no personal column', () => {
    expect(view).toContain('CREATE OR REPLACE VIEW report_bookings AS');
    expect(view).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
    const columns = (view.split('SELECT')[1] ?? '').split('FROM')[0]?.split(',').map((column) => column.trim()) ?? [];
    expect(columns.slice(-2)).toEqual(['payment_status', 'paid_at']);
    for (const personal of ['booker_name', 'booker_email', 'booker_phone', 'guest_note', 'creator_ip_hash', 'cancel_note']) {
      expect(columns).not.toContain(personal);
    }
  });

  it('keeps every column the view had before, in the same order, so the replace is allowed', () => {
    const before = strip('027_database_access.sql');
    const old = (before.split('CREATE OR REPLACE VIEW report_bookings AS')[1] ?? '').split('FROM inventory_blocks')[0]?.replace('SELECT', '').split(',').map((column) => column.trim()) ?? [];
    const next = (view.split('SELECT')[1] ?? '').split('FROM')[0]?.split(',').map((column) => column.trim()) ?? [];
    expect(next.slice(0, old.length)).toEqual(old);
  });
});
