/**
 * @file apps/api/src/modules/bookings/staff-refunds.repository.ts
 * @feature bookings
 * @dependencies DatabaseService, staff-history
 */

import { Injectable } from '@nestjs/common';
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
}

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
      SELECT id, organization_id, inventory_block_id, status, provider, amount_cents, percent, currency_code, reason
      FROM refunds WHERE id = $1
      `,
      [refundId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Takes a refund for retrying: only a failed one, or an online one stuck "pending" for over a minute
   * (the app stopped between recording it and asking the provider). Returns false when it is not
   * claimable, so two quick clicks can never both reach the provider.
   */
  public async claimForRetry(refundId: string): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE refunds
      SET status = 'pending', failure_reason = NULL, updated_at = now()
      WHERE id = $1
        AND (status = 'failed' OR (status = 'pending' AND provider <> 'manual' AND updated_at < now() - interval '60 seconds'))
      `,
      [refundId],
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
   * Marks a pending or failed refund as paid by hand, with who and how. False if it was not open.
   */
  public async markManualPaid(refundId: string, staffId: string, note: string): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE refunds
      SET status = 'succeeded', provider = 'manual', failure_reason = NULL,
        resolution_note = $3, resolved_by_staff_id = $2, resolved_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('pending', 'failed')
      `,
      [refundId, staffId, note],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
