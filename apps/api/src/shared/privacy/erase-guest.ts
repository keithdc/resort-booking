/**
 * @file apps/api/src/shared/privacy/erase-guest.ts
 * @shared GDPR Art. 17 for a guest: find every booking for one email, say what would change, anonymise it, leave a receipt
 * @dependencies privacy-db, privacy-hash, anonymise-sql, inventory.rules (booking reference)
 *
 * The financial record stays (dates, amounts, currency, status, payments, refunds, the reference) because accounting and
 * tax law require it; only the person is removed. A booking that is still to be stayed, has a refund being settled or a
 * payment that can still settle is skipped (the person may still be needed to serve it) unless `forceFuture` is set.
 * The audit entry and the ledger row hold a keyed hash of the email, never the address.
 */

import { referenceFor } from '../../modules/inventory/inventory.rules';
import { ANONYMISED_NAME, anonymiseBookingsSql, LIVE_HOLD_SQL, OPEN_PAYMENT_SQL, OPEN_REFUND_SQL, REMOVED_TEXT } from './anonymise-sql';
import type { PrivacyDb, PrivacyTx } from './privacy-db';
import { normaliseEmail, subjectHash } from './privacy-hash';

export type SkipReason = 'future_stay' | 'open_refund' | 'open_payment' | 'live_hold';

/** One booking found for the email. */
export interface GuestBooking {
  id: string;
  reference: string;
  organizationId: string;
  kind: string;
  status: string;
  checkIn: string;
  checkOut: string;
  anonymisedAt: string | null;
  /** The stay is not over (check-out today or later) and the booking is not cancelled. */
  upcoming: boolean;
  openRefund: boolean;
  openPayment: boolean;
  liveHold: boolean;
}

export interface GuestPlanItem {
  booking: GuestBooking;
  /** `erase`: will be anonymised. `skip`: kept, with the reasons. `done`: was anonymised before. */
  decision: 'erase' | 'skip' | 'done';
  reasons: SkipReason[];
}

export interface GuestErasurePlan {
  items: GuestPlanItem[];
  toErase: number;
  skipped: number;
  alreadyDone: number;
}

interface BookingRow {
  id: string;
  organization_id: string;
  kind: string;
  status: string;
  check_in: string;
  check_out: string;
  anonymised_at: string | null;
  upcoming: boolean;
  open_refund: boolean;
  open_payment: boolean;
  live_hold: boolean;
}

/** Why a booking cannot be anonymised right now (empty: it can). Pure, so the rule is easy to test. */
export function skipReasonsFor(booking: GuestBooking): SkipReason[] {
  const reasons: SkipReason[] = [];
  if (booking.upcoming) {
    reasons.push('future_stay');
  }
  if (booking.openRefund) {
    reasons.push('open_refund');
  }
  if (booking.openPayment) {
    reasons.push('open_payment');
  }
  if (booking.liveHold) {
    reasons.push('live_hold');
  }
  return reasons;
}

/** Turns the bookings found into a decision per booking. */
export function planGuestErasure(bookings: readonly GuestBooking[], forceFuture: boolean): GuestErasurePlan {
  const items = bookings.map((booking: GuestBooking): GuestPlanItem => {
    if (booking.anonymisedAt !== null) {
      return { booking, decision: 'done', reasons: [] };
    }
    const reasons = skipReasonsFor(booking);
    return { booking, decision: reasons.length > 0 && !forceFuture ? 'skip' : 'erase', reasons };
  });
  return {
    items,
    toErase: items.filter((item: GuestPlanItem): boolean => item.decision === 'erase').length,
    skipped: items.filter((item: GuestPlanItem): boolean => item.decision === 'skip').length,
    alreadyDone: items.filter((item: GuestPlanItem): boolean => item.decision === 'done').length,
  };
}

const FIND_SQL = `
  SELECT ib.id, ib.organization_id, ib.kind, ib.status, ib.check_in::text AS check_in, ib.check_out::text AS check_out,
         ib.anonymised_at::text AS anonymised_at,
         (ib.kind = 'reservation' AND ib.status <> 'cancelled' AND ib.check_out >= current_date) AS upcoming,
         ${OPEN_REFUND_SQL} AS open_refund,
         ${OPEN_PAYMENT_SQL} AS open_payment,
         ${LIVE_HOLD_SQL} AS live_hold
  FROM inventory_blocks ib
  WHERE lower(btrim(ib.booker_email)) = $1
  ORDER BY ib.created_at, ib.id
`;

function toBooking(row: BookingRow): GuestBooking {
  return {
    id: row.id,
    reference: referenceFor(row.id),
    organizationId: row.organization_id,
    kind: row.kind,
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    anonymisedAt: row.anonymised_at,
    upcoming: row.upcoming,
    openRefund: row.open_refund,
    openPayment: row.open_payment,
    liveHold: row.live_hold,
  };
}

/** Every booking, hold and block whose booker email matches (ignoring case and surrounding spaces). One query. */
export async function findGuestBookings(db: PrivacyDb, email: string): Promise<GuestBooking[]> {
  return db.transaction(
    async (tx: PrivacyTx): Promise<GuestBooking[]> => (await tx.query<BookingRow>(FIND_SQL, [normaliseEmail(email)])).rows.map(toBooking),
    { readOnly: true },
  );
}

export interface EraseGuestOptions {
  email: string;
  apply: boolean;
  forceFuture: boolean;
  operator: string;
  salt: string;
}

export interface ErasureReceipt {
  mode: 'dry-run' | 'apply';
  /** First 12 characters of the keyed hash: enough to match a ledger row, useless to find the person. */
  subjectHashPrefix: string;
  found: number;
  erased: GuestPlanItem[];
  skipped: GuestPlanItem[];
  alreadyDone: number;
  refundNotesScrubbed: number;
  changeNotesScrubbed: number;
  staffNotesScrubbed: number;
  /** "Once per guest" email keys cleared (the same address can use such a code again). */
  emailKeysCleared: number;
  forced: boolean;
  operator: string;
}

/**
 * Plans, and with `apply` performs, the erasure in ONE transaction (bookings, scrubbed notes, ledger row and one audit
 * entry per organization all commit together or not at all). Running it again finds nothing left to do.
 */
export async function eraseGuest(db: PrivacyDb, options: EraseGuestOptions): Promise<ErasureReceipt> {
  const bookings = await findGuestBookings(db, options.email);
  const plan = planGuestErasure(bookings, options.forceFuture);
  const erased = plan.items.filter((item: GuestPlanItem): boolean => item.decision === 'erase');
  const hash = subjectHash(options.email, options.salt);
  const receipt: ErasureReceipt = {
    mode: options.apply ? 'apply' : 'dry-run',
    subjectHashPrefix: hash.slice(0, 12),
    found: bookings.length,
    erased,
    skipped: plan.items.filter((item: GuestPlanItem): boolean => item.decision === 'skip'),
    alreadyDone: plan.alreadyDone,
    refundNotesScrubbed: 0,
    changeNotesScrubbed: 0,
    staffNotesScrubbed: 0,
    emailKeysCleared: 0,
    forced: options.forceFuture && erased.some((item: GuestPlanItem): boolean => item.reasons.length > 0),
    operator: options.operator,
  };
  if (!options.apply || erased.length === 0) {
    return receipt;
  }
  const ids = erased.map((item: GuestPlanItem): string => item.booking.id);
  await db.transaction(
    async (tx: PrivacyTx): Promise<void> => {
      const result = await tx.query<{ n: number; refund_notes: number; change_notes: number; staff_notes: number; email_keys: number }>(
        anonymiseBookingsSql('SELECT ib.id FROM inventory_blocks ib WHERE ib.id = ANY($3::uuid[]) AND ib.anonymised_at IS NULL FOR UPDATE OF ib'),
        [ANONYMISED_NAME, REMOVED_TEXT, ids],
      );
      const row = result.rows[0];
      const anonymised = row?.n ?? 0;
      receipt.refundNotesScrubbed = row?.refund_notes ?? 0;
      receipt.changeNotesScrubbed = row?.change_notes ?? 0;
      receipt.staffNotesScrubbed = row?.staff_notes ?? 0;
      receipt.emailKeysCleared = row?.email_keys ?? 0;
      await tx.query(
        `INSERT INTO privacy_erasure_ledger (subject_kind, subject_hash, bookings_anonymised, forced, operator) VALUES ('guest', $1, $2, $3, $4)`,
        [hash, anonymised, receipt.forced, options.operator.slice(0, 80)],
      );
      const perOrganization = new Map<string, number>();
      for (const item of erased) {
        perOrganization.set(item.booking.organizationId, (perOrganization.get(item.booking.organizationId) ?? 0) + 1);
      }
      for (const [organizationId, bookingCount] of perOrganization) {
        await tx.query(
          `INSERT INTO audit_log (organization_id, staff_user_id, action, target_type, target_id, metadata)
           VALUES ($1, NULL, 'privacy.guest_erased', 'guest', $2, $3::jsonb)`,
          [
            organizationId,
            hash.slice(0, 32),
            JSON.stringify({ subjectHash: hash, bookings: bookingCount, forced: receipt.forced, operator: options.operator.slice(0, 80) }),
          ],
        );
      }
    },
    { maintenance: true },
  );
  return receipt;
}

export interface ReapplyReport {
  mode: 'dry-run' | 'apply';
  ledgerEntries: number;
  emailsMatched: number;
  bookingsAnonymised: number;
}

/**
 * After restoring a backup made before some erasures: anonymise again every booking whose email hashes to a ledger
 * entry. Reads the distinct emails still held (a set, not a query per email), hashes them here, and anonymises the
 * matches in one transaction. No skip rules: the person already asked, and was refused nothing then.
 */
export async function reapplyErasures(db: PrivacyDb, options: { apply: boolean; salt: string }): Promise<ReapplyReport> {
  const known = await db.transaction(
    async (tx: PrivacyTx): Promise<{ hashes: Set<string>; emails: string[] }> => {
      const ledger = await tx.query<{ subject_hash: string }>(`SELECT DISTINCT subject_hash FROM privacy_erasure_ledger WHERE subject_kind = 'guest'`);
      const held = await tx.query<{ email: string }>(
        `SELECT DISTINCT lower(btrim(booker_email)) AS email FROM inventory_blocks WHERE booker_email IS NOT NULL AND anonymised_at IS NULL`,
      );
      return { hashes: new Set(ledger.rows.map((row: { subject_hash: string }): string => row.subject_hash)), emails: held.rows.map((row: { email: string }): string => row.email) };
    },
    { readOnly: true },
  );
  const matched = known.emails.filter((email: string): boolean => known.hashes.has(subjectHash(email, options.salt)));
  const report: ReapplyReport = { mode: options.apply ? 'apply' : 'dry-run', ledgerEntries: known.hashes.size, emailsMatched: matched.length, bookingsAnonymised: 0 };
  if (!options.apply || matched.length === 0) {
    return report;
  }
  await db.transaction(
    async (tx: PrivacyTx): Promise<void> => {
      const result = await tx.query<{ n: number }>(
        anonymiseBookingsSql('SELECT ib.id FROM inventory_blocks ib WHERE lower(btrim(ib.booker_email)) = ANY($3::text[]) AND ib.anonymised_at IS NULL FOR UPDATE OF ib'),
        [ANONYMISED_NAME, REMOVED_TEXT, matched],
      );
      report.bookingsAnonymised = result.rows[0]?.n ?? 0;
    },
    { maintenance: true },
  );
  return report;
}
