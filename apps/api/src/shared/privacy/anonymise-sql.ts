/**
 * @file apps/api/src/shared/privacy/anonymise-sql.ts
 * @shared The SQL that replaces a guest's personal data on bookings, shared by the retention job and the erasure tool
 * @dependencies none: pure strings, so the rules can be tested without a database
 *
 * What stays on an anonymised booking: id (and so the BK- reference), stay, dates, guest count, status, currency, total and
 * paid amounts, payment method, price and policy snapshots, the cancellation reason CODE, timestamps, and every payment,
 * refund (amount, status, kind) and discount row. What goes: name (placeholder), email and phone (NULL, so nobody can
 * look the booking up by an address, not even a placeholder one), the note, the cancellation note, the abuse-limit IP hash,
 * and the free-text notes staff typed on refunds and date changes. `anonymised_at` marks the row as done.
 */

/** Shown in the admin instead of the guest's name. */
export const ANONYMISED_NAME = 'Anonymised guest';
/** Replaces a free-text note that may have named someone. */
export const REMOVED_TEXT = '[removed]';
/** Replaces the staff name in anonymised audit entries and on an erased staff account. */
export const FORMER_STAFF_NAME = 'Former staff member';

/** A refund still being settled: its person data must stay until staff can finish it. */
export const OPEN_REFUND_SQL = `EXISTS (SELECT 1 FROM refunds r WHERE r.inventory_block_id = ib.id AND r.status IN ('pending', 'failed'))`;

/** A payment attempt that can still settle (opened in the last two days). */
export const OPEN_PAYMENT_SQL = `EXISTS (SELECT 1 FROM payments p WHERE p.inventory_block_id = ib.id AND p.status = 'requires_payment' AND p.created_at > now() - interval '2 days')`;

/** A checkout in progress: an active hold that has not run out yet. */
export const LIVE_HOLD_SQL = `(ib.kind = 'hold' AND ib.status = 'active' AND ib.expires_at IS NOT NULL AND ib.expires_at >= now())`;

/**
 * One batch: anonymise the bookings chosen by `pickedSql` (a SELECT of `ib.id` over `inventory_blocks ib`), in a single
 * statement. Parameters `$1` = ANONYMISED_NAME and `$2` = REMOVED_TEXT are always bound; `pickedSql` brings its own
 * from `$3` on. Returns one row: `n` bookings, `refund_notes` and `change_notes` scrubbed. Needs the maintenance switch
 * (refunds and booking_changes are guarded tables).
 */
export function anonymiseBookingsSql(pickedSql: string): string {
  return `
    WITH picked AS (${pickedSql}),
    done AS (
      UPDATE inventory_blocks ib
      SET booker_name = $1::text, booker_email = NULL, booker_phone = NULL, guest_note = '',
          cancel_note = CASE WHEN ib.cancel_note IS NULL THEN NULL ELSE $2::text END,
          creator_ip_hash = NULL, anonymised_at = now()
      FROM picked WHERE ib.id = picked.id
      RETURNING ib.id
    ),
    refund_notes AS (
      UPDATE refunds r SET resolution_note = $2::text
      FROM done
      WHERE r.inventory_block_id = done.id AND r.resolution_note IS NOT NULL AND r.resolution_note <> $2::text
      RETURNING r.id
    ),
    change_notes AS (
      UPDATE booking_changes bc SET note = $2::text
      WHERE (bc.old_booking_id IN (SELECT id FROM done) OR bc.new_booking_id IN (SELECT id FROM done))
        AND bc.note IS NOT NULL AND bc.note <> $2::text
      RETURNING bc.id
    )
    SELECT (SELECT count(*) FROM done)::int AS n,
           (SELECT count(*) FROM refund_notes)::int AS refund_notes,
           (SELECT count(*) FROM change_notes)::int AS change_notes
  `;
}
