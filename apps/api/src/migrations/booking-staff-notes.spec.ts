/**
 * @file apps/api/src/migrations/booking-staff-notes.spec.ts
 * Migration 043 (staff notes on a booking): additive, replayable, and the guard says what docs/04 and docs/15 promise.
 * The behaviour against a real database is in staff-notes.integration.spec.ts (opt-in).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '043_booking_staff_notes.sql'), 'utf8').replace(/^\s*--.*$/gm, '');

describe('043_booking_staff_notes.sql', () => {
  it('only adds: no delete, truncate, update of rows or dropped table or column', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+\w+\s+SET\b|\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('is replayable', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS booking_staff_notes');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS booking_staff_notes_booking_idx');
    expect(sql).toContain('DROP TRIGGER IF EXISTS booking_staff_notes_guard');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION resort_guard_booking_staff_notes');
  });

  it('bounds the text to 1 to 2000 characters', () => {
    expect(sql).toContain('CHECK (length(body) BETWEEN 1 AND 2000)');
  });

  it('ties the note to the booking and the property of the SAME organization', () => {
    expect(sql).toContain('FOREIGN KEY (inventory_block_id, organization_id) REFERENCES inventory_blocks (id, organization_id)');
    expect(sql).toContain('FOREIGN KEY (property_id, organization_id) REFERENCES properties (id, organization_id)');
  });

  it('never edits text or author, refuses DELETE, hides a note only once, and keeps the owner-run escape hatch', () => {
    for (const column of ['inventory_block_id', 'body', 'created_by_staff_id', 'created_at']) {
      expect(sql).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`);
    }
    expect(sql).toContain("RAISE EXCEPTION 'booking_staff_notes rows are not deleted");
    expect(sql).toContain("RAISE EXCEPTION 'a staff note is never edited'");
    expect(sql).toContain("RAISE EXCEPTION 'a hidden staff note stays hidden'");
    expect(sql).toContain("current_setting('resort.record_maintenance', true)");
  });
});
