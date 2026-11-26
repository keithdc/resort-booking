/**
 * @file apps/api/src/modules/bookings/bookings.repository.ts
 * @feature bookings
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { ActionInitiator, BookingPaymentStatus, RefundStatus, StaffCancelReason } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { parseRefundablePayments, type RefundablePayment, type UuidRange } from './bookings.rules';

/** One booking with everything the guest view and a date change need, read in a single query. */
export interface BookingRow {
  id: string;
  organization_id: string;
  property_id: string;
  house_id: string;
  property_name: string;
  property_timezone: string;
  stay_name: string;
  status: 'confirmed' | 'cancelled';
  check_in: string;
  check_out: string;
  guest_count: number;
  booker_name: string | null;
  booker_email: string | null;
  booker_phone: string | null;
  guest_note: string | null;
  payment_method: string | null;
  /** `pending`: a pay-at-hotel booking nobody has marked paid yet. */
  payment_status: BookingPaymentStatus;
  total_cents: number | null;
  currency_code: string | null;
  /** What has been paid for this booking so far (the booking's own column, kept up to date). */
  paid_cents: number | null;
  policy_snapshot: unknown;
  price_snapshot: unknown;
  /** The booking this one replaced when its dates were changed, else null. */
  rebook_of_id: string | null;
  /** The booking that replaced this one when its dates were changed, else null. */
  replaced_by_id: string | null;
  /** Succeeded payments that can still give money back, newest first. */
  payments: RefundablePayment[];
  refund_id: string | null;
  refund_amount_cents: number | null;
  refund_percent: number | null;
  refund_status: RefundStatus | null;
  refund_provider: string | null;
  refund_currency: string | null;
}

/** The row as the database returns it: `payments` is JSON until it is read safely. */
type RawBookingRow = Omit<BookingRow, 'payments'> & { payments: unknown };

export type RefundKind = 'cancellation' | 'rebook_difference' | 'late_payment';

/** Why a booking was cancelled, kept on the booking. `dates_changed` is a cancel-and-replace. */
export type CancelReasonCode = StaffCancelReason | 'dates_changed';

/** The reason kept on a refund: a cancel reason, or `late_payment` (a payment that arrived after the hold ended). */
export type RefundReasonCode = CancelReasonCode | 'late_payment';

/** Who cancelled, why, and any note. Guests leave `staffId` and `note` empty. */
export interface CancelMeta {
  reason: CancelReasonCode;
  staffId: string | null;
  note: string | null;
}

/** What a booking is, for answering staff about an id that is not a reservation. */
export interface BlockKind {
  id: string;
  organization_id: string;
  kind: string;
  status: string;
  currency_code: string | null;
}

export interface InsertRefundInput {
  organizationId: string;
  propertyId: string;
  bookingId: string;
  paymentId: string | null;
  provider: string;
  amountCents: number;
  percent: number;
  currencyCode: string;
  status: RefundStatus;
  reason: string;
  kind?: RefundKind;
  /** Machine-readable reason shown to staff. Defaults from the refund kind when left out. */
  reasonCode?: RefundReasonCode;
  /** Defaults to the guest. */
  initiatedBy?: ActionInitiator;
  /** The staff member who made the refund, when staff did. */
  createdByStaffId?: string | null;
}

export interface InsertRebookedBookingInput {
  oldBookingId: string;
  newCheckIn: string;
  newCheckOut: string;
  totalCents: number;
  paidCents: number;
  /** JSON text of the price the guest was quoted for the new dates. */
  priceSnapshot: string;
}

export interface InsertChangeInput {
  organizationId: string;
  propertyId: string;
  oldBookingId: string;
  newBookingId: string;
  paymentId: string | null;
  oldCheckIn: string;
  oldCheckOut: string;
  newCheckIn: string;
  newCheckOut: string;
  oldTotalCents: number;
  newTotalCents: number;
  feeCents: number;
  payCents: number;
  refundCents: number;
  /** Defaults to the guest. */
  initiatedBy?: ActionInitiator;
  staffId?: string | null;
  note?: string | null;
}

// Stay name, property, payments, refund and the replacing booking all arrive in this one statement:
// no query per booking, however many payments it has.
const SELECT_BOOKING = `
  SELECT ib.id, ib.organization_id, ib.property_id, ib.house_id, p.name AS property_name,
    p.timezone AS property_timezone, h.name AS stay_name, ib.status,
    ib.check_in::text AS check_in, ib.check_out::text AS check_out, ib.guest_count,
    ib.booker_name, ib.booker_email, ib.booker_phone, ib.guest_note, ib.payment_method, ib.payment_status,
    ib.total_cents, ib.currency_code, ib.paid_cents, ib.policy_snapshot, ib.price_snapshot, ib.rebook_of_id,
    (
      SELECT nb.id FROM inventory_blocks nb
      WHERE nb.rebook_of_id = ib.id AND nb.kind = 'reservation'
      ORDER BY nb.created_at DESC LIMIT 1
    ) AS replaced_by_id,
    COALESCE((
      SELECT json_agg(json_build_object(
        'id', pay.id,
        'provider', pay.provider,
        'providerRef', pay.provider_ref,
        'refundableCents', pay.amount_cents - COALESCE((
          SELECT sum(r.amount_cents) FROM refunds r
          WHERE r.payment_id = pay.id AND r.status IN ('pending', 'succeeded')
        ), 0)
      ) ORDER BY pay.created_at DESC)
      FROM payments pay
      WHERE pay.inventory_block_id = ib.id AND pay.status = 'succeeded'
    ), '[]'::json) AS payments,
    rf.id AS refund_id, rf.amount_cents AS refund_amount_cents, rf.percent AS refund_percent,
    rf.status AS refund_status, rf.provider AS refund_provider, rf.currency_code AS refund_currency
  FROM inventory_blocks ib
  JOIN houses h ON h.id = ib.house_id
  JOIN properties p ON p.id = ib.property_id
  LEFT JOIN refunds rf ON rf.inventory_block_id = ib.id AND rf.kind = 'cancellation'
  WHERE ib.kind = 'reservation' AND ib.status IN ('confirmed', 'cancelled')
`;

@Injectable()
export class BookingsRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Bookings whose id falls in the reference's range AND whose booker email matches (ignoring case).
   * Reads at most two rows: two means the reference is ambiguous, and the caller treats it as not found.
   */
  public async findByReference(range: UuidRange, email: string): Promise<BookingRow[]> {
    const result = await this.database.query<RawBookingRow>(
      `${SELECT_BOOKING} AND ib.id >= $1::uuid AND ib.id <= $2::uuid AND lower(ib.booker_email) = lower($3) LIMIT 2`,
      [range.low, range.high, email],
    );
    return result.rows.map(mapRow);
  }

  /**
   * One booking by id.
   */
  public async findById(bookingId: string): Promise<BookingRow | null> {
    const result = await this.database.query<RawBookingRow>(`${SELECT_BOOKING} AND ib.id = $1`, [bookingId]);
    const row = result.rows[0];
    return row === undefined ? null : mapRow(row);
  }

  /**
   * Locks the booking row for the rest of the caller's transaction so two cancels (or a cancel and a
   * date change) cannot both win. Returns its current status, or null if it is not a reservation.
   */
  public async lockForCancel(client: PoolClient, bookingId: string): Promise<'confirmed' | 'cancelled' | 'other' | null> {
    const result = await client.query<{ status: string }>(
      `SELECT status FROM inventory_blocks WHERE id = $1 AND kind = 'reservation' FOR UPDATE`,
      [bookingId],
    );
    const status = result.rows[0]?.status;
    if (status === undefined) {
      return null;
    }
    return status === 'confirmed' || status === 'cancelled' ? status : 'other';
  }

  /**
   * Cancels a confirmed booking and records who and why. The dates are free again: the no-overlap
   * constraint only covers active and confirmed rows. Without `meta` it is the guest's own request.
   */
  public async markCancelled(client: PoolClient, bookingId: string, meta?: CancelMeta): Promise<void> {
    await client.query(
      `
      UPDATE inventory_blocks
      SET status = 'cancelled', cancelled_at = now(),
        cancel_reason = $2, cancelled_by_staff_id = $3, cancel_note = $4
      WHERE id = $1 AND status = 'confirmed'
      `,
      [bookingId, meta?.reason ?? 'guest_request', meta?.staffId ?? null, meta?.note ?? null],
    );
  }

  /**
   * Marks a pay-at-hotel booking as paid, once: pending -> paid, with the time, who did it, and everything paid.
   * Returns false when no row matched (not pending, not confirmed, or not a pay-at-hotel booking), so a second
   * tick, or a tick after a cancel, changes nothing.
   */
  public async markPaid(bookingId: string, staffId: string): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE inventory_blocks
      SET payment_status = 'paid', paid_at = now(), paid_cents = COALESCE(total_cents, 0), marked_paid_by_staff_id = $2
      WHERE id = $1
        AND kind = 'reservation'
        AND status = 'confirmed'
        AND payment_status = 'pending'
        AND payment_method = 'pay_at_hotel'
      `,
      [bookingId, staffId],
    );
    return (result.rowCount ?? 0) === 1;
  }

  /**
   * What an id is when it is not a booking staff can work with (a hold, say). Null if it does not exist.
   */
  public async findKind(blockId: string): Promise<BlockKind | null> {
    const result = await this.database.query<BlockKind>(
      `SELECT id, organization_id, kind, status, currency_code FROM inventory_blocks WHERE id = $1`,
      [blockId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Records a refund for a booking. One refund of each kind per booking: a repeat does nothing and
   * returns null, so a second cancel can never refund twice.
   */
  public async insertRefund(client: PoolClient, input: InsertRefundInput): Promise<string | null> {
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO refunds (
        organization_id, property_id, inventory_block_id, payment_id, provider,
        amount_cents, percent, currency_code, status, reason, initiated_by, kind,
        reason_code, created_by_staff_id, processing_started_at, attempts
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        CASE WHEN $9 = 'pending' AND $5 <> 'manual' THEN now() END,
        CASE WHEN $9 = 'pending' AND $5 <> 'manual' THEN 1 ELSE 0 END
      )
      ON CONFLICT (inventory_block_id, kind) DO NOTHING
      RETURNING id
      `,
      [
        input.organizationId,
        input.propertyId,
        input.bookingId,
        input.paymentId,
        input.provider,
        input.amountCents,
        input.percent,
        input.currencyCode,
        input.status,
        input.reason,
        input.initiatedBy ?? 'guest',
        input.kind ?? 'cancellation',
        input.reasonCode ?? (input.kind === 'rebook_difference' ? 'dates_changed' : 'guest_request'),
        input.createdByStaffId ?? null,
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Settles a refund after the provider answered, and lets go of the lease. A refund that already succeeded is never
   * touched again (false). `bumpKeyGeneration` is for a DEFINITIVE refusal: the next attempt then sends a fresh
   * idempotency key (a provider caches the refusal for the old one).
   */
  public async completeRefund(
    refundId: string,
    status: 'succeeded' | 'failed',
    providerRef: string,
    failureReason: string | null,
    options: { bumpKeyGeneration?: boolean } = {},
  ): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE refunds
      SET status = $2, provider_ref = $3, failure_reason = $4, processing_started_at = NULL,
        key_generation = key_generation + $5::int, updated_at = now()
      WHERE id = $1 AND status <> 'succeeded'
      `,
      [refundId, status, providerRef, failureReason, options.bumpKeyGeneration === true ? 1 : 0],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * The provider could not say what happened (timeout, dropped connection): the refund stays pending, keeps its lease
   * until it runs out, and says why. The reconciler asks again with the same idempotency key.
   */
  public async noteRefundOutcomeUnknown(refundId: string, note: string): Promise<void> {
    await this.database.query(
      `UPDATE refunds SET failure_reason = $2, updated_at = now() WHERE id = $1 AND status = 'pending'`,
      [refundId, note.slice(0, 500)],
    );
  }

  // --- Changing dates ---

  /**
   * Creates the NEW booking that replaces an old one: a copy of the old row (same stay, guest, policy
   * snapshot and recorded terms acceptance) with the new dates and price, linked by `rebook_of_id`.
   * The old row must already be cancelled in this transaction, so overlapping dates do not clash. If
   * the new window is taken the database's no-overlap rule rejects the insert (code 23P01).
   */
  public async insertRebookedBooking(client: PoolClient, input: InsertRebookedBookingInput): Promise<string> {
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO inventory_blocks (
        organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count,
        payment_method, booker_name, booker_email, booker_phone, guest_note,
        total_cents, currency_code, price_snapshot, policy_snapshot, terms_accepted_at, paid_cents, rebook_of_id
      )
      SELECT organization_id, property_id, house_id, 'reservation', 'confirmed', $2::date, $3::date, guest_count,
        payment_method, booker_name, booker_email, booker_phone, guest_note,
        $4, currency_code, $5::jsonb, policy_snapshot, terms_accepted_at, $6, id
      FROM inventory_blocks
      WHERE id = $1
      RETURNING id
      `,
      [input.oldBookingId, input.newCheckIn, input.newCheckOut, input.totalCents, input.priceSnapshot, input.paidCents],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Rebooked booking insert returned no row');
    }
    return id;
  }

  /**
   * The guest's chosen requests ride along to the new booking.
   */
  public async copyRequests(client: PoolClient, fromBookingId: string, toBookingId: string): Promise<void> {
    await client.query(
      `
      INSERT INTO inventory_block_requests (inventory_block_id, request_option_id)
      SELECT $2::uuid, request_option_id FROM inventory_block_requests WHERE inventory_block_id = $1
      `,
      [fromBookingId, toBookingId],
    );
  }

  /**
   * What has been paid now belongs to the new booking, so a later cancel refunds from the right
   * payments. Only succeeded payments move; history rows keep their ids.
   */
  public async moveSucceededPayments(client: PoolClient, fromBookingId: string, toBookingId: string): Promise<void> {
    await client.query(
      `UPDATE payments SET inventory_block_id = $2, updated_at = now() WHERE inventory_block_id = $1 AND status = 'succeeded'`,
      [fromBookingId, toBookingId],
    );
  }

  /**
   * Records a date change for the audit trail.
   */
  public async insertChange(client: PoolClient, input: InsertChangeInput): Promise<void> {
    await client.query(
      `
      INSERT INTO booking_changes (
        organization_id, property_id, old_booking_id, new_booking_id, payment_id,
        old_check_in, old_check_out, new_check_in, new_check_out,
        old_total_cents, new_total_cents, fee_cents, pay_cents, refund_cents, initiated_by,
        staff_user_id, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      [
        input.organizationId,
        input.propertyId,
        input.oldBookingId,
        input.newBookingId,
        input.paymentId,
        input.oldCheckIn,
        input.oldCheckOut,
        input.newCheckIn,
        input.newCheckOut,
        input.oldTotalCents,
        input.newTotalCents,
        input.feeCents,
        input.payCents,
        input.refundCents,
        input.initiatedBy ?? 'guest',
        input.staffId ?? null,
        input.note ?? null,
      ],
    );
  }

  /**
   * The booking a settled balance payment produced, or null.
   */
  public async findBookingIdByChangePayment(paymentId: string): Promise<string | null> {
    const result = await this.database.query<{ new_booking_id: string }>(
      `SELECT new_booking_id FROM booking_changes WHERE payment_id = $1`,
      [paymentId],
    );
    return result.rows[0]?.new_booking_id ?? null;
  }
}

function mapRow(raw: RawBookingRow): BookingRow {
  return { ...raw, payments: parseRefundablePayments(raw.payments) };
}
