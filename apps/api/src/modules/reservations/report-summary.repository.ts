/**
 * @file apps/api/src/modules/reservations/report-summary.repository.ts
 * @feature reservations
 * @dependencies DatabaseService
 *
 * The extra numbers the owner report needs: cancellations and refunds, discount usage, what needs
 * attention today, and every stay of a property. Every method is ONE aggregate statement (never one
 * per booking), so a big property costs the same as a small one.
 */

import { Injectable } from '@nestjs/common';
import type {
  CancellationReasonRow,
  DiscountUsageRow,
  ReportAttention,
  StaffRefund,
} from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { mapStaffRefund, STAFF_REFUND_SELECT, type StaffRefundRow } from './staff-history';

const REFUND_LIST_LIMIT = 200;

/** One stay of a property, booked or not. */
export interface HouseCatalogRow {
  houseId: string;
  houseName: string;
  propertyId: string;
  propertyName: string;
  currencyCode: string;
}

interface CancellationRow {
  reason: string;
  cancelled_count: number;
  paid_cents: number;
  refunded_cents: number;
}

interface DiscountUsageDbRow {
  discount_id: string;
  label: string;
  redemption_count: number;
  discount_cents: number;
}

interface AttentionBookingRow {
  unpaid_hold_count: number;
  arrivals_today_count: number;
  arrivals_next_7_days_count: number;
  unpaid_at_hotel_count: number;
  unpaid_at_hotel_cents: number;
  unpaid_at_hotel_arrivals_next_7_days_count: number;
  unpaid_at_hotel_past_count: number;
}

interface AttentionRefundRow {
  refund_count: number;
  refund_cents: number;
}

interface HouseCatalogDbRow {
  house_id: string;
  house_name: string;
  property_id: string;
  property_name: string;
  currency_code: string;
}

@Injectable()
export class ReportSummaryRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Bookings cancelled (not changed to other dates) with nights in [from, to), by reason. Paid and
   * refunded money is shared out over the booking's nights, so a stay across two periods is split
   * between them exactly like confirmed revenue is.
   */
  public async cancellationsByReason(
    from: string,
    to: string,
    propertyId: string | null,
    organizationId: string,
  ): Promise<CancellationReasonRow[]> {
    const result = await this.database.query<CancellationRow>(
      `
      WITH cancelled AS (
        SELECT COALESCE(ib.cancel_reason, 'guest_request') AS reason,
          COALESCE(ib.paid_cents, ib.total_cents, 0) AS paid,
          COALESCE(r.amount_cents, 0) AS refunded,
          (ib.check_out - ib.check_in) AS total_nights,
          GREATEST(0, LEAST(ib.check_out, $2::date) - GREATEST(ib.check_in, $1::date)) AS overlap
        FROM inventory_blocks ib
        LEFT JOIN refunds r ON r.inventory_block_id = ib.id AND r.kind = 'cancellation'
        WHERE ib.kind = 'reservation'
          AND ib.status = 'cancelled'
          AND COALESCE(ib.cancel_reason, 'guest_request') <> 'dates_changed'
          AND NOT EXISTS (
            SELECT 1 FROM inventory_blocks nb WHERE nb.rebook_of_id = ib.id AND nb.kind = 'reservation'
          )
          AND ib.check_in < $2::date AND ib.check_out > $1::date
          AND ($3::uuid IS NULL OR ib.property_id = $3)
          AND ib.organization_id = $4::uuid
      )
      SELECT reason,
        COUNT(*)::int AS cancelled_count,
        COALESCE(SUM(ROUND(paid::numeric * overlap / NULLIF(total_nights, 0))), 0)::int AS paid_cents,
        COALESCE(SUM(ROUND(refunded::numeric * overlap / NULLIF(total_nights, 0))), 0)::int AS refunded_cents
      FROM cancelled
      GROUP BY reason
      ORDER BY cancelled_count DESC, reason ASC
      `,
      [from, to, propertyId, organizationId],
    );
    return result.rows.map(
      (row: CancellationRow): CancellationReasonRow => ({
        reason: row.reason,
        cancelledCount: row.cancelled_count,
        paidCents: row.paid_cents,
        refundedCents: row.refunded_cents,
      }),
    );
  }

  /**
   * The cancellation refunds of those cancelled bookings, newest first (one statement, capped).
   */
  public async cancellationRefunds(
    from: string,
    to: string,
    propertyId: string | null,
    organizationId: string,
  ): Promise<StaffRefund[]> {
    const result = await this.database.query<StaffRefundRow>(
      `${STAFF_REFUND_SELECT}
       WHERE r.kind = 'cancellation'
         AND ib.check_in < $2::date AND ib.check_out > $1::date
         AND ($3::uuid IS NULL OR r.property_id = $3)
         AND r.organization_id = $4::uuid
       ORDER BY r.created_at DESC
       LIMIT ${REFUND_LIST_LIMIT}`,
      [from, to, propertyId, organizationId],
    );
    return result.rows.map(mapStaffRefund);
  }

  /**
   * Discount given on confirmed bookings with nights in [from, to), per discount, biggest first.
   */
  public async discountUsage(
    from: string,
    to: string,
    propertyId: string | null,
    organizationId: string,
  ): Promise<DiscountUsageRow[]> {
    const result = await this.database.query<DiscountUsageDbRow>(
      `
      SELECT d.id AS discount_id, d.label,
        COUNT(*)::int AS redemption_count,
        COALESCE(SUM(dr.amount_cents), 0)::int AS discount_cents
      FROM discount_redemptions dr
      INNER JOIN discounts d ON d.id = dr.discount_id
      INNER JOIN inventory_blocks ib ON ib.id = dr.inventory_block_id
      WHERE ib.kind = 'reservation'
        AND ib.status = 'confirmed'
        AND ib.check_in < $2::date AND ib.check_out > $1::date
        AND ($3::uuid IS NULL OR ib.property_id = $3)
        AND ib.organization_id = $4::uuid
        AND d.organization_id = $4::uuid
      GROUP BY d.id, d.label
      ORDER BY discount_cents DESC, d.label ASC
      `,
      [from, to, propertyId, organizationId],
    );
    return result.rows.map(
      (row: DiscountUsageDbRow): DiscountUsageRow => ({
        discountId: row.discount_id,
        label: row.label,
        redemptionCount: row.redemption_count,
        discountCents: row.discount_cents,
      }),
    );
  }

  /**
   * What needs a person as of `asOfDate`: live unpaid holds, arrivals today and in the next 7 days,
   * pay-at-hotel bookings nobody has marked paid (all, arriving within 7 days, already past), and refunds still
   * waiting to be paid. Two statements in total.
   */
  public async attention(asOfDate: string, propertyId: string | null, organizationId: string): Promise<ReportAttention> {
    const bookings = await this.database.query<AttentionBookingRow>(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE ib.kind = 'hold' AND ib.status = 'active' AND (ib.expires_at IS NULL OR ib.expires_at > now())
        )::int AS unpaid_hold_count,
        COUNT(*) FILTER (
          WHERE ib.kind = 'reservation' AND ib.status = 'confirmed'
            AND ib.arrival_status = 'expected' AND ib.check_in = $1::date
        )::int AS arrivals_today_count,
        COUNT(*) FILTER (
          WHERE ib.kind = 'reservation' AND ib.status = 'confirmed'
            AND ib.arrival_status = 'expected'
            AND ib.check_in > $1::date AND ib.check_in <= $1::date + 7
        )::int AS arrivals_next_7_days_count,
        COUNT(*) FILTER (
          WHERE ib.kind = 'reservation' AND ib.status = 'confirmed' AND ib.payment_status = 'pending'
        )::int AS unpaid_at_hotel_count,
        COALESCE(SUM(COALESCE(ib.total_cents, 0)) FILTER (
          WHERE ib.kind = 'reservation' AND ib.status = 'confirmed' AND ib.payment_status = 'pending'
        ), 0)::int AS unpaid_at_hotel_cents,
        COUNT(*) FILTER (
          WHERE ib.kind = 'reservation' AND ib.status = 'confirmed' AND ib.payment_status = 'pending'
            AND ib.check_in >= $1::date AND ib.check_in <= $1::date + 7
        )::int AS unpaid_at_hotel_arrivals_next_7_days_count,
        COUNT(*) FILTER (
          WHERE ib.kind = 'reservation' AND ib.status = 'confirmed' AND ib.payment_status = 'pending'
            AND ib.check_in < $1::date
        )::int AS unpaid_at_hotel_past_count
      FROM inventory_blocks ib
      WHERE ($2::uuid IS NULL OR ib.property_id = $2)
        AND ib.organization_id = $3::uuid
      `,
      [asOfDate, propertyId, organizationId],
    );
    const refunds = await this.database.query<AttentionRefundRow>(
      `
      SELECT COUNT(*)::int AS refund_count, COALESCE(SUM(r.amount_cents), 0)::int AS refund_cents
      FROM refunds r
      WHERE r.status IN ('pending', 'failed')
        AND ($1::uuid IS NULL OR r.property_id = $1)
        AND r.organization_id = $2::uuid
      `,
      [propertyId, organizationId],
    );
    const booking = bookings.rows[0];
    const refund = refunds.rows[0];
    return {
      unpaidHoldCount: booking?.unpaid_hold_count ?? 0,
      refundsToPayCount: refund?.refund_count ?? 0,
      refundsToPayCents: refund?.refund_cents ?? 0,
      arrivalsTodayCount: booking?.arrivals_today_count ?? 0,
      arrivalsNext7DaysCount: booking?.arrivals_next_7_days_count ?? 0,
      unpaidAtHotelCount: booking?.unpaid_at_hotel_count ?? 0,
      unpaidAtHotelCents: booking?.unpaid_at_hotel_cents ?? 0,
      unpaidAtHotelArrivalsNext7DaysCount: booking?.unpaid_at_hotel_arrivals_next_7_days_count ?? 0,
      unpaidAtHotelPastCount: booking?.unpaid_at_hotel_past_count ?? 0,
    };
  }

  /**
   * Every stay of the property (or of all properties), so unbooked stays show up with zeros.
   */
  public async houseCatalog(propertyId: string | null, organizationId: string): Promise<HouseCatalogRow[]> {
    const result = await this.database.query<HouseCatalogDbRow>(
      `
      SELECT h.id AS house_id, h.name AS house_name, p.id AS property_id, p.name AS property_name,
        h.currency_code
      FROM houses h
      INNER JOIN properties p ON p.id = h.property_id
      WHERE ($1::uuid IS NULL OR p.id = $1)
        AND p.organization_id = $2::uuid
      ORDER BY p.name ASC, h.name ASC
      `,
      [propertyId, organizationId],
    );
    return result.rows.map(
      (row: HouseCatalogDbRow): HouseCatalogRow => ({
        houseId: row.house_id,
        houseName: row.house_name,
        propertyId: row.property_id,
        propertyName: row.property_name,
        currencyCode: row.currency_code,
      }),
    );
  }
}
