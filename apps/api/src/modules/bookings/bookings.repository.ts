/**
 * @file apps/api/src/modules/bookings/bookings.repository.ts
 * @feature bookings
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { RefundStatus } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import type { UuidRange } from './bookings.rules';

/** One booking with everything the guest view needs, read in a single query. */
export interface BookingRow {
  id: string;
  organization_id: string;
  property_id: string;
  property_name: string;
  property_timezone: string;
  stay_name: string;
  status: 'confirmed' | 'cancelled';
  check_in: string;
  check_out: string;
  guest_count: number;
  booker_name: string | null;
  total_cents: number | null;
  currency_code: string | null;
  policy_snapshot: unknown;
  payment_id: string | null;
  payment_provider: string | null;
  payment_ref: string | null;
  paid_cents: number | null;
  refund_id: string | null;
  refund_amount_cents: number | null;
  refund_percent: number | null;
  refund_status: RefundStatus | null;
  refund_provider: string | null;
  refund_currency: string | null;
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
}

// Stay name, property, payment and refund all arrive in this one statement: no query per booking.
const SELECT_BOOKING = `
  SELECT ib.id, ib.organization_id, ib.property_id, p.name AS property_name, p.timezone AS property_timezone,
    h.name AS stay_name, ib.status, ib.check_in::text AS check_in, ib.check_out::text AS check_out,
    ib.guest_count, ib.booker_name, ib.total_cents, ib.currency_code, ib.policy_snapshot,
    pay.id AS payment_id, pay.provider AS payment_provider, pay.provider_ref AS payment_ref,
    pay.amount_cents AS paid_cents,
    rf.id AS refund_id, rf.amount_cents AS refund_amount_cents, rf.percent AS refund_percent,
    rf.status AS refund_status, rf.provider AS refund_provider, rf.currency_code AS refund_currency
  FROM inventory_blocks ib
  JOIN houses h ON h.id = ib.house_id
  JOIN properties p ON p.id = ib.property_id
  LEFT JOIN payments pay ON pay.inventory_block_id = ib.id AND pay.status = 'succeeded'
  LEFT JOIN refunds rf ON rf.inventory_block_id = ib.id
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
    const result = await this.database.query<BookingRow>(
      `${SELECT_BOOKING} AND ib.id >= $1::uuid AND ib.id <= $2::uuid AND lower(ib.booker_email) = lower($3) LIMIT 2`,
      [range.low, range.high, email],
    );
    return result.rows;
  }

  /**
   * One booking by id.
   */
  public async findById(bookingId: string): Promise<BookingRow | null> {
    const result = await this.database.query<BookingRow>(`${SELECT_BOOKING} AND ib.id = $1`, [bookingId]);
    return result.rows[0] ?? null;
  }

  /**
   * Locks the booking row for the rest of the caller's transaction so two cancels cannot both win.
   * Returns its current status, or null if it is not a reservation.
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
   * Cancels a confirmed booking. The dates are free again: the no-overlap constraint only covers
   * active and confirmed rows.
   */
  public async markCancelled(client: PoolClient, bookingId: string): Promise<void> {
    await client.query(
      `UPDATE inventory_blocks SET status = 'cancelled', cancelled_at = now() WHERE id = $1 AND status = 'confirmed'`,
      [bookingId],
    );
  }

  /**
   * Records the refund for a cancelled booking. One refund per booking: a repeat does nothing and
   * returns null, so a second cancel can never refund twice.
   */
  public async insertRefund(client: PoolClient, input: InsertRefundInput): Promise<string | null> {
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO refunds (
        organization_id, property_id, inventory_block_id, payment_id, provider,
        amount_cents, percent, currency_code, status, reason, initiated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'guest')
      ON CONFLICT (inventory_block_id) DO NOTHING
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
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Settles a pending refund after the provider answered.
   */
  public async completeRefund(
    refundId: string,
    status: 'succeeded' | 'failed',
    providerRef: string,
    failureReason: string | null,
  ): Promise<void> {
    await this.database.query(
      `UPDATE refunds SET status = $2, provider_ref = $3, failure_reason = $4, updated_at = now() WHERE id = $1`,
      [refundId, status, providerRef, failureReason],
    );
  }
}
