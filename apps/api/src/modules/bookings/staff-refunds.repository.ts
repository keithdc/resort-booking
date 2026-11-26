/**
 * @file apps/api/src/modules/bookings/staff-refunds.repository.ts
 * @feature bookings
 * @dependencies DatabaseService, staff-history
 */

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { RefundStatus, StaffRefund } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { mapStaffRefund, STAFF_REFUND_SELECT, type StaffRefundRow } from '../reservations/staff-history';
import { parseRefundablePayments, type RefundablePayment } from './bookings.rules';

/** The bits of a refund staff actions need to decide and to act. */
export interface RefundActionRow {
  id: string;
  organization_id: string;
  inventory_block_id: string;
  status: RefundStatus;
  provider: string;
  amount_cents: number;
  percent: number;
  currency_code: string;
  /** The readable reason text kept on the refund. */
  reason: string;
  /** Part of the provider idempotency key (see refundIdempotencyKey). */
  key_generation: number;
  /** When a process last took the refund to call the provider, or null. */
  processing_started_at: Date | null;
}

/** What taking a refund hands back: the idempotency key generation to use and how many times it was taken. */
export interface RefundClaim {
  keyGeneration: number;
  attempts: number;
}

/** A pending online refund the reconciler should look at. */
export interface StuckRefund {
  id: string;
  organization_id: string;
  inventory_block_id: string;
  amount_cents: number;
  percent: number;
  currency_code: string;
  reason: string;
  attempts: number;
  /** Minutes since the refund was created. */
  age_minutes: number;
}

/** How a hand-marked refund ended: paid, or why it was not. */
export type ManualPaidOutcome = 'paid' | 'busy' | 'not_open';

/** True when nobody holds a live lease on the refund. $2 is the lease length in seconds. */
const STALE_LEASE = "(processing_started_at IS NULL OR processing_started_at < now() - make_interval(secs => $2::int))";

@Injectable()
export class StaffRefundsRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Refunds for staff, newest first, in ONE statement joined with booking, stay and property.
   * `statuses` null means every status.
   */
  public async list(
    organizationId: string,
    statuses: readonly RefundStatus[] | null,
    propertyId: string | null,
  ): Promise<StaffRefund[]> {
    const result = await this.database.query<StaffRefundRow>(
      `
      ${STAFF_REFUND_SELECT}
      WHERE r.organization_id = $1
        AND ($2::text[] IS NULL OR r.status = ANY($2::text[]))
        AND ($3::uuid IS NULL OR r.property_id = $3)
      ORDER BY r.created_at DESC
      `,
      [organizationId, statuses === null ? null : [...statuses], propertyId],
    );
    return result.rows.map(mapStaffRefund);
  }

  /**
   * One refund as staff see it, or null.
   */
  public async getStaffRefund(refundId: string): Promise<StaffRefund | null> {
    const result = await this.database.query<StaffRefundRow>(`${STAFF_REFUND_SELECT} WHERE r.id = $1`, [refundId]);
    const row = result.rows[0];
    return row === undefined ? null : mapStaffRefund(row);
  }

  /**
   * What staff actions need to know about a refund, or null.
   */
  public async findForAction(refundId: string): Promise<RefundActionRow | null> {
    const result = await this.database.query<RefundActionRow>(
      `
      SELECT id, organization_id, inventory_block_id, status, provider, amount_cents, percent, currency_code, reason,
        key_generation, processing_started_at
      FROM refunds WHERE id = $1
      `,
      [refundId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Takes a refund to call the provider, in ONE atomic step: a failed refund, or an online one that is pending and whose
   * lease is stale (nobody has held it for `leaseSeconds`: the app stopped, or the answer was lost). It sets a fresh
   * lease and counts the attempt. Returns null when it is not claimable, in particular while another process still holds
   * a live lease, so two quick clicks, or a click and the reconciler, can never both reach the provider.
   */
  public async claimForRetry(refundId: string, leaseSeconds: number): Promise<RefundClaim | null> {
    const result = await this.database.query<{ key_generation: number; attempts: number }>(
      `
      UPDATE refunds
      SET status = 'pending', failure_reason = NULL, processing_started_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = $1
        AND (
          status = 'failed'
          OR (status = 'pending' AND provider <> 'manual' AND ${STALE_LEASE})
        )
      RETURNING key_generation, attempts
      `,
      [refundId, leaseSeconds],
    );
    const row = result.rows[0];
    return row === undefined ? null : { keyGeneration: row.key_generation, attempts: row.attempts };
  }

  /**
   * Takes a PENDING online refund whose lease is stale, for the reconciler: same atomic step as claimForRetry, but it
   * never takes a failed refund (a person owns those). Null when somebody else got there first.
   */
  public async claimStuck(refundId: string, leaseSeconds: number): Promise<RefundClaim | null> {
    const result = await this.database.query<{ key_generation: number; attempts: number }>(
      `
      UPDATE refunds
      SET processing_started_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = $1 AND status = 'pending' AND provider <> 'manual' AND ${STALE_LEASE}
      RETURNING key_generation, attempts
      `,
      [refundId, leaseSeconds],
    );
    const row = result.rows[0];
    return row === undefined ? null : { keyGeneration: row.key_generation, attempts: row.attempts };
  }

  /**
   * Online refunds still waiting on the provider for longer than `olderThanMinutes` whose lease is stale, oldest first.
   * These are the crash leftovers and lost answers the reconciler settles.
   */
  public async findStuck(olderThanMinutes: number, leaseSeconds: number, limit: number): Promise<StuckRefund[]> {
    const result = await this.database.query<StuckRefund>(
      `
      SELECT id, organization_id, inventory_block_id, amount_cents, percent, currency_code, reason, attempts,
        (extract(epoch FROM (now() - created_at)) / 60)::int AS age_minutes
      FROM refunds
      WHERE status = 'pending' AND provider <> 'manual'
        AND updated_at < now() - make_interval(mins => $1::int)
        AND ${STALE_LEASE}
      ORDER BY updated_at ASC
      LIMIT $3
      `,
      [olderThanMinutes, leaseSeconds, limit],
    );
    return result.rows;
  }

  /**
   * The refund a provider event is about, locked for the caller's transaction: by our id when the provider echoes it,
   * else by the provider's refund id kept in `provider_ref` (comma separated when one refund went out in two parts).
   */
  public async lockByProviderRefund(
    client: PoolClient,
    providerRefundId: string,
    refundId: string | null,
  ): Promise<{ id: string; status: RefundStatus } | null> {
    const result = await client.query<{ id: string; status: RefundStatus }>(
      `
      SELECT id, status FROM refunds
      WHERE ($2::uuid IS NOT NULL AND id = $2::uuid) OR $1 = ANY(string_to_array(provider_ref, ','))
      LIMIT 1
      FOR UPDATE
      `,
      [providerRefundId, refundId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Applies the provider's word to a refund inside the caller's transaction: a success settles a pending or failed
   * refund; a failure only fails a PENDING one (and raises the key generation: the provider refused, so a retry needs a
   * fresh key). A paid refund is never changed. True when the row changed.
   */
  public async settleFromProvider(
    client: PoolClient,
    refundId: string,
    status: 'succeeded' | 'failed',
    providerRefundId: string,
    failureReason: string | null,
  ): Promise<boolean> {
    const result =
      status === 'succeeded'
        ? await client.query(
            `
            UPDATE refunds
            SET status = 'succeeded', failure_reason = NULL, processing_started_at = NULL,
              provider_ref = CASE WHEN provider_ref = '' THEN $2 ELSE provider_ref END, updated_at = now()
            WHERE id = $1 AND status IN ('pending', 'failed')
            `,
            [refundId, providerRefundId],
          )
        : await client.query(
            `
            UPDATE refunds
            SET status = 'failed', failure_reason = $2, processing_started_at = NULL,
              key_generation = key_generation + 1, updated_at = now()
            WHERE id = $1 AND status = 'pending'
            `,
            [refundId, `The provider reported the refund as failed${failureReason === null ? '' : ` (${failureReason})`}`],
          );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * The booking's succeeded payments and how much each can still give back, NOT counting the refund
   * being retried (it is already recorded as pending against them).
   */
  public async refundablePayments(bookingId: string, excludeRefundId: string): Promise<RefundablePayment[]> {
    const result = await this.database.query<{ id: string; provider: string; providerRef: string; refundableCents: number }>(
      `
      SELECT pay.id, pay.provider, pay.provider_ref AS "providerRef",
        (pay.amount_cents - COALESCE((
          SELECT sum(r.amount_cents) FROM refunds r
          WHERE r.payment_id = pay.id AND r.status IN ('pending', 'succeeded') AND r.id <> $2
        ), 0))::int AS "refundableCents"
      FROM payments pay
      WHERE pay.inventory_block_id = $1 AND pay.status = 'succeeded'
      ORDER BY pay.created_at DESC
      `,
      [bookingId, excludeRefundId],
    );
    return parseRefundablePayments(result.rows);
  }

  /**
   * Marks a pending or failed refund as paid by hand, with who and how. Refused (`busy`) while a provider call for it
   * may still be in flight (live lease): the money could go out twice. `not_open` when it is already paid.
   */
  public async markManualPaid(refundId: string, staffId: string, note: string, leaseSeconds: number): Promise<ManualPaidOutcome> {
    const result = await this.database.query(
      `
      UPDATE refunds
      SET status = 'succeeded', provider = 'manual', failure_reason = NULL, processing_started_at = NULL,
        resolution_note = $3, resolved_by_staff_id = $4, resolved_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('pending', 'failed') AND ${STALE_LEASE}
      `,
      [refundId, leaseSeconds, note, staffId],
    );
    if ((result.rowCount ?? 0) > 0) {
      return 'paid';
    }
    const current = await this.findForAction(refundId);
    return current !== null && current.status !== 'succeeded' ? 'busy' : 'not_open';
  }
}
