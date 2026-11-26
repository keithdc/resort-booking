/**
 * @file apps/api/src/shared/privacy/export-guest.ts
 * @shared GDPR Art. 15 and 20 for a guest: everything held about one email, as a JSON file written with 0600 permissions
 * @dependencies privacy-db, privacy-hash, inventory.rules (booking reference), node:fs
 *
 * The file holds personal data: it is never printed to the terminal, never overwrites an existing file, and only the
 * counts are shown on screen. Constant query count: one per table, whatever the number of bookings.
 */

import { chmod, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { referenceFor } from '../../modules/inventory/inventory.rules';
import type { PrivacyDb, PrivacyTx } from './privacy-db';
import { normaliseEmail } from './privacy-hash';

export interface GuestExport {
  format: 'resort-booking-guest-export/1';
  generatedAt: string;
  subjectEmail: string;
  bookings: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  extraRequests: Record<string, unknown>[];
  /** Extras chosen on the bookings (name, kind, quantity, price). */
  bookingExtras: Record<string, unknown>[];
  staffNotes: Record<string, unknown>[];
  dateChanges: Record<string, unknown>[];
  discountRedemptions: Record<string, unknown>[];
  notes: string[];
}

export interface ExportCounts {
  bookings: number;
  payments: number;
  refunds: number;
  extraRequests: number;
  bookingExtras: number;
  staffNotes: number;
  dateChanges: number;
  discountRedemptions: number;
}

const BOOKINGS_SQL = `
  SELECT ib.id, ib.kind, ib.status, ib.check_in::text AS check_in, ib.check_out::text AS check_out, ib.guest_count,
         ib.payment_method, ib.payment_status, ib.paid_at, ib.booker_name, ib.booker_email, ib.booker_phone, ib.guest_note, ib.total_cents, ib.paid_cents,
         ib.currency_code, ib.arrival_status, ib.price_snapshot, ib.policy_snapshot, ib.terms_accepted_at, ib.cancelled_at,
         ib.cancel_reason, ib.cancel_note, ib.rebook_of_id, ib.created_at, ib.anonymised_at, h.name AS stay_name, p.name AS property_name
  FROM inventory_blocks ib
  JOIN houses h ON h.id = ib.house_id
  JOIN properties p ON p.id = ib.property_id
  WHERE lower(btrim(ib.booker_email)) = $1
  ORDER BY ib.created_at, ib.id
`;

/**
 * Collects the export for one email in eight read-only queries (bookings, then the seven tables keyed by booking ids).
 */
export async function collectGuestExport(db: PrivacyDb, email: string, now: Date = new Date()): Promise<GuestExport> {
  const normalised = normaliseEmail(email);
  return db.transaction(
    async (tx: PrivacyTx): Promise<GuestExport> => {
      const bookings = (await tx.query<Record<string, unknown> & { id: string }>(BOOKINGS_SQL, [normalised])).rows;
      const ids = bookings.map((row: { id: string }): string => row.id);
      const byIds = async (sql: string): Promise<Record<string, unknown>[]> => (await tx.query<Record<string, unknown>>(sql, [ids])).rows;
      const payments = await byIds(
        `SELECT id, inventory_block_id, provider, provider_ref, amount_cents, currency_code, status, purpose, failure_reason, created_at
         FROM payments WHERE inventory_block_id = ANY($1::uuid[]) ORDER BY created_at, id`,
      );
      const refunds = await byIds(
        `SELECT id, inventory_block_id, payment_id, kind, amount_cents, percent, currency_code, status, reason, reason_code, initiated_by, resolution_note, resolved_at, created_at
         FROM refunds WHERE inventory_block_id = ANY($1::uuid[]) ORDER BY created_at, id`,
      );
      const extraRequests = await byIds(
        `SELECT ibr.inventory_block_id, o.name, o.description
         FROM inventory_block_requests ibr JOIN property_request_options o ON o.id = ibr.request_option_id
         WHERE ibr.inventory_block_id = ANY($1::uuid[]) ORDER BY ibr.inventory_block_id, o.name`,
      );
      const bookingExtras = await byIds(
        `SELECT inventory_block_id, name, kind, quantity, unit_price_cents, line_cents, currency_code, status, created_at
         FROM reservation_extras WHERE inventory_block_id = ANY($1::uuid[]) ORDER BY inventory_block_id, created_at, name`,
      );
      // What staff wrote about the person is personal data too. Hidden notes are included: they are still stored.
      const staffNotes = await byIds(
        `SELECT inventory_block_id, body, created_at, deleted_at
         FROM booking_staff_notes WHERE inventory_block_id = ANY($1::uuid[]) ORDER BY inventory_block_id, created_at, id`,
      );
      const dateChanges = await byIds(
        `SELECT id, old_booking_id, new_booking_id, old_check_in::text AS old_check_in, old_check_out::text AS old_check_out,
                new_check_in::text AS new_check_in, new_check_out::text AS new_check_out, old_total_cents, new_total_cents,
                fee_cents, pay_cents, refund_cents, initiated_by, note, created_at
         FROM booking_changes WHERE old_booking_id = ANY($1::uuid[]) OR new_booking_id = ANY($1::uuid[]) ORDER BY created_at, id`,
      );
      const discountRedemptions = await byIds(
        `SELECT id, discount_id, inventory_block_id, amount_cents, created_at
         FROM discount_redemptions WHERE inventory_block_id = ANY($1::uuid[]) ORDER BY created_at, id`,
      );
      return {
        format: 'resort-booking-guest-export/1',
        generatedAt: now.toISOString(),
        subjectEmail: normalised,
        bookings: bookings.map((row: Record<string, unknown> & { id: string }): Record<string, unknown> => ({ reference: referenceFor(row.id), ...row })),
        payments,
        refunds,
        extraRequests,
        bookingExtras,
        staffNotes,
        dateChanges,
        discountRedemptions,
        notes: [
          'Card numbers are never stored by this system: only the payment provider reference is listed.',
          'Staff activity records (audit log) refer to bookings by id and hold no guest contact data.',
          'Bookings with an anonymised_at value no longer hold name, email, phone or notes.',
        ],
      };
    },
    { readOnly: true },
  );
}

/** How many rows of each kind the export holds (safe to print). */
export function countExport(data: GuestExport): ExportCounts {
  return {
    bookings: data.bookings.length,
    payments: data.payments.length,
    refunds: data.refunds.length,
    extraRequests: data.extraRequests.length,
    bookingExtras: data.bookingExtras.length,
    staffNotes: data.staffNotes.length,
    dateChanges: data.dateChanges.length,
    discountRedemptions: data.discountRedemptions.length,
  };
}

/**
 * Refuses a path that is not a regular new file: a missing path, a terminal or device, and an existing file.
 * Returns the absolute path.
 */
export function assertSafeOutputPath(out: string | undefined): string {
  if (out === undefined || out.trim() === '' || out.trim() === '-') {
    throw new Error('--out <file> is required: the export holds personal data and is never printed to the terminal.');
  }
  const absolute = resolve(out.trim());
  if (absolute.startsWith('/dev/')) {
    throw new Error('--out must be a regular file, not a device or the terminal.');
  }
  return absolute;
}

/**
 * Writes the JSON with mode 0600. `wx` means it fails rather than overwrite an existing file; the explicit chmod covers
 * a umask that would have been looser than the mode (it cannot be, but the file's final mode is what matters).
 */
export async function writeExportFile(path: string, data: GuestExport): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}
