/**
 * @file apps/api/src/modules/reservations/reservations.repository.ts
 * @feature reservations
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type {
  ArrivalStatus,
  CancellationTier,
  HoldStatus,
  InventoryKind,
  PaymentMethod,
  PropertyBookingConfig,
  RebookFeeType,
  StaffBookingChange,
  StaffRefund,
  StaffReservation,
} from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { referenceFor } from '../inventory/inventory.rules';
import type { PolicySnapshot } from './reservations.rules';
import {
  deriveCancellation,
  groupBy,
  mapStaffChange,
  mapStaffRefund,
  STAFF_CHANGES_SELECT,
  STAFF_REFUND_SELECT,
  type StaffChangeRow,
  type StaffRefundRow,
} from './staff-history';

interface ReservationRow {
  id: string;
  organization_id: string;
  property_id: string;
  property_name: string;
  house_id: string;
  house_name: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  guest_note: string;
  payment_method: PaymentMethod | null;
  status: HoldStatus;
  total_cents: number | null;
  currency_code: string;
  nightly_rate_cents: number;
  request_names: string[];
  kind: InventoryKind;
  arrival_status: ArrivalStatus;
  rebook_of_id: string | null;
  paid_cents: number | null;
  terms_accepted_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  cancelled_by_staff_id: string | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
  cancel_note: string | null;
  /** The booking that replaced this one after a date change, else null. */
  replaced_by_id: string | null;
}

// One definition of the booking columns and joins, shared by every staff read. The replacing booking
// and the staff name arrive in the same statement: no query per booking.
const RESERVATION_SELECT = `
  SELECT ib.id, ib.organization_id, ib.property_id, p.name AS property_name,
    ib.house_id, h.name AS house_name,
    to_char(ib.check_in, 'YYYY-MM-DD') AS check_in,
    to_char(ib.check_out, 'YYYY-MM-DD') AS check_out, ib.guest_count,
    ib.booker_name, ib.booker_email, ib.booker_phone, COALESCE(ib.guest_note, '') AS guest_note, ib.payment_method, ib.status,
    ib.total_cents, ib.currency_code, h.nightly_rate_cents,
    ib.kind, ib.rebook_of_id, ib.arrival_status,
    ib.paid_cents, ib.terms_accepted_at, ib.cancelled_at, ib.created_at,
    ib.cancelled_by_staff_id, su.full_name AS cancelled_by_name, ib.cancel_reason, ib.cancel_note,
    (
      SELECT nb.id FROM inventory_blocks nb
      WHERE nb.rebook_of_id = ib.id AND nb.kind = 'reservation'
      ORDER BY nb.created_at DESC LIMIT 1
    ) AS replaced_by_id,
    COALESCE((
      SELECT array_agg(pro.name ORDER BY pro.name)
      FROM inventory_block_requests ibr
      INNER JOIN property_request_options pro ON pro.id = ibr.request_option_id
      WHERE ibr.inventory_block_id = ib.id
    ), ARRAY[]::text[]) AS request_names
  FROM inventory_blocks ib
  INNER JOIN properties p ON p.id = ib.property_id
  INNER JOIN houses h ON h.id = ib.house_id
  LEFT JOIN staff_users su ON su.id = ib.cancelled_by_staff_id
`;

interface ConfigRow {
  property_id: string;
  property_name: string;
  rebookable: boolean;
  rebook_fee_type: RebookFeeType;
  rebook_fee_value: string;
}

interface TierRow {
  id: string;
  property_id: string;
  min_days_before_check_in: number;
  refund_percent: number;
}

@Injectable()
export class ReservationsRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Confirmed stays overlapping [from, to). Used only to add up nights and revenue, so refunds and
   * change history are NOT loaded here (they come back empty).
   */
  public async listConfirmedOverlapping(
    from: string,
    to: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      ${RESERVATION_SELECT}
      WHERE ib.kind = 'reservation'
        AND ib.status = 'confirmed'
        AND daterange(ib.check_in, ib.check_out, '[)') && daterange($1::date, $2::date, '[)')
        AND ($3::uuid IS NULL OR ib.property_id = $3)
      ORDER BY ib.check_in ASC, h.name ASC
      `,
      [from, to, propertyId],
    );
    return result.rows.map((row): StaffReservation => mapReservation(row, [], []));
  }

  /**
   * Confirmed stays occupying a single night, with refunds and change history.
   */
  public async listConfirmedOnDate(
    onDate: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      ${RESERVATION_SELECT}
      WHERE ib.kind = 'reservation'
        AND ib.status = 'confirmed'
        AND ib.check_in <= $1::date
        AND ib.check_out > $1::date
        AND ($2::uuid IS NULL OR ib.property_id = $2)
      ORDER BY p.name ASC, h.name ASC
      `,
      [onDate, propertyId],
    );
    return this.withHistory(result.rows);
  }

  /**
   * Booked, pending, cancelled, and rebooked stays occupying a single night, with refunds and change
   * history for every one of them (two extra queries in total, however many bookings).
   */
  public async listPipelineOnDate(
    onDate: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      ${RESERVATION_SELECT}
      WHERE ib.kind IN ('hold', 'reservation')
        AND ib.status IN ('confirmed', 'cancelled', 'active', 'released')
        AND ib.check_in <= $1::date
        AND ib.check_out > $1::date
        AND ($2::uuid IS NULL OR ib.property_id = $2)
      ORDER BY p.name ASC, h.name ASC
      `,
      [onDate, propertyId],
    );
    return this.withHistory(result.rows);
  }

  /**
   * Holds and reservations in the window, including unpaid, released, and cancelled. Used only to
   * count them per day, so refunds and change history are NOT loaded here (they come back empty).
   */
  public async listPipelineOverlapping(
    from: string,
    to: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      ${RESERVATION_SELECT}
      WHERE ib.kind IN ('hold', 'reservation')
        AND daterange(ib.check_in, ib.check_out, '[)') && daterange($1::date, $2::date, '[)')
        AND ($3::uuid IS NULL OR ib.property_id = $3)
      ORDER BY ib.check_in ASC, h.name ASC
      `,
      [from, to, propertyId],
    );
    return result.rows.map((row): StaffReservation => mapReservation(row, [], []));
  }

  /**
   * Refunds and date changes for ALL the given bookings in two statements (one each), then handed
   * to the booking they belong to. Skips both queries for an empty list.
   */
  private async withHistory(rows: readonly ReservationRow[]): Promise<StaffReservation[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row): string => row.id);
    const refundRows = await this.database.query<StaffRefundRow>(
      `${STAFF_REFUND_SELECT} WHERE r.inventory_block_id = ANY($1::uuid[]) ORDER BY r.created_at ASC`,
      [ids],
    );
    const changeRows = await this.database.query<StaffChangeRow>(STAFF_CHANGES_SELECT, [ids]);
    const refunds = groupBy(refundRows.rows.map(mapStaffRefund), (refund): string[] => [refund.reservationId]);
    const changes = groupBy(changeRows.rows, (change): string[] => [change.old_booking_id, change.new_booking_id]);
    return rows.map(
      (row): StaffReservation =>
        mapReservation(row, refunds.get(row.id) ?? [], (changes.get(row.id) ?? []).map(mapStaffChange)),
    );
  }

  /**
   * One property's current policy, for saving with a new booking. Two queries, both filtered to the
   * property (unlike listBookingConfig, which reads every property for the staff screen).
   */
  public async getPolicySnapshot(propertyId: string): Promise<PolicySnapshot | null> {
    const settings = await this.database.query<{
      rebookable: boolean;
      rebook_fee_type: RebookFeeType;
      rebook_fee_value: string;
    }>(
      `
      SELECT COALESCE(r.rebookable, false) AS rebookable,
        COALESCE(r.rebook_fee_type, 'none') AS rebook_fee_type,
        COALESCE(r.rebook_fee_value, 0) AS rebook_fee_value
      FROM properties p
      LEFT JOIN property_rebook_settings r ON r.property_id = p.id
      WHERE p.id = $1
      `,
      [propertyId],
    );
    const row = settings.rows[0];
    if (row === undefined) {
      return null;
    }
    const tiers = await this.database.query<{ min_days_before_check_in: number; refund_percent: number }>(
      `
      SELECT min_days_before_check_in, refund_percent
      FROM cancellation_tiers
      WHERE property_id = $1
      ORDER BY min_days_before_check_in DESC
      `,
      [propertyId],
    );
    return {
      tiers: tiers.rows.map((tier) => ({
        minDaysBeforeCheckIn: tier.min_days_before_check_in,
        refundPercent: tier.refund_percent,
      })),
      rebookable: row.rebookable,
      rebookFeeType: row.rebook_fee_type,
      rebookFeeValue: Number.parseFloat(row.rebook_fee_value),
    };
  }

  /**
   * Property cancellation ladders and rebook flags.
   */
  public async listBookingConfig(): Promise<PropertyBookingConfig[]> {
    const properties = await this.database.query<ConfigRow>(
      `
      SELECT p.id AS property_id, p.name AS property_name,
        COALESCE(r.rebookable, false) AS rebookable,
        COALESCE(r.rebook_fee_type, 'none') AS rebook_fee_type,
        COALESCE(r.rebook_fee_value, 0) AS rebook_fee_value
      FROM properties p
      LEFT JOIN property_rebook_settings r ON r.property_id = p.id
      ORDER BY p.name ASC
      `,
    );
    const tiers = await this.database.query<TierRow>(
      `
      SELECT id, property_id, min_days_before_check_in, refund_percent
      FROM cancellation_tiers
      ORDER BY min_days_before_check_in DESC
      `,
    );
    return properties.rows.map((row): PropertyBookingConfig => ({
      propertyId: row.property_id,
      propertyName: row.property_name,
      rebookable: row.rebookable,
      rebookFeeType: row.rebook_fee_type,
      rebookFeeValue: Number.parseFloat(row.rebook_fee_value),
      tiers: tiers.rows
        .filter((tier: TierRow): boolean => tier.property_id === row.property_id)
        .map(
          (tier: TierRow): CancellationTier => ({
            id: tier.id,
            propertyId: tier.property_id,
            minDaysBeforeCheckIn: tier.min_days_before_check_in,
            refundPercent: tier.refund_percent,
          }),
        ),
    }));
  }

  /**
   * One property's live refund + rebook settings.
   */
  public async getBookingConfig(propertyId: string): Promise<PropertyBookingConfig | null> {
    const all = await this.listBookingConfig();
    return all.find((row: PropertyBookingConfig): boolean => row.propertyId === propertyId) ?? null;
  }

  /**
   * Replaces the ladder and rebook flags. Snapshot at booking is unchanged.
   */
  public async saveBookingConfig(
    propertyId: string,
    organizationId: string,
    rebookable: boolean,
    rebookFeeType: RebookFeeType,
    rebookFeeValue: number,
    tiers: Array<{ minDaysBeforeCheckIn: number; refundPercent: number }>,
  ): Promise<PropertyBookingConfig> {
    await this.database.withClient(async (client): Promise<void> => {
      await client.query('BEGIN');
      try {
        await client.query(
          `
          INSERT INTO property_rebook_settings (
            property_id, organization_id, rebookable, rebook_fee_type, rebook_fee_value
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (property_id) DO UPDATE SET
            rebookable = EXCLUDED.rebookable,
            rebook_fee_type = EXCLUDED.rebook_fee_type,
            rebook_fee_value = EXCLUDED.rebook_fee_value
          `,
          [propertyId, organizationId, rebookable, rebookFeeType, rebookFeeValue],
        );
        await client.query('DELETE FROM cancellation_tiers WHERE property_id = $1', [propertyId]);
        for (const tier of tiers) {
          await client.query(
            `
            INSERT INTO cancellation_tiers (
              organization_id, property_id, min_days_before_check_in, refund_percent
            ) VALUES ($1, $2, $3, $4)
            `,
            [organizationId, propertyId, tier.minDaysBeforeCheckIn, tier.refundPercent],
          );
        }
        await client.query('COMMIT');
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    const saved = await this.getBookingConfig(propertyId);
    if (saved === null) {
      throw new Error('Saved booking config missing');
    }
    return saved;
  }

  /**
   * One booking for staff, with its refunds and change history.
   */
  public async getById(id: string): Promise<StaffReservation | null> {
    const result = await this.database.query<ReservationRow>(`${RESERVATION_SELECT} WHERE ib.id = $1`, [id]);
    const [row] = await this.withHistory(result.rows);
    return row ?? null;
  }

  /**
   * Check-in / check-out on a confirmed stay. Payment status is unchanged.
   */
  public async updateArrivalStatus(id: string, arrivalStatus: ArrivalStatus): Promise<StaffReservation | null> {
    await this.database.query(
      `
      UPDATE inventory_blocks
      SET arrival_status = $2
      WHERE id = $1
        AND kind = 'reservation'
        AND status = 'confirmed'
      `,
      [id, arrivalStatus],
    );
    return this.getById(id);
  }
}

function mapReservation(
  row: ReservationRow,
  refunds: StaffRefund[],
  changes: StaffBookingChange[],
): StaffReservation {
  const nights =
    Date.parse(`${row.check_out}T00:00:00Z`) - Date.parse(`${row.check_in}T00:00:00Z`);
  const nightCount = Math.round(nights / 86_400_000);
  const computed = nightCount * row.nightly_rate_cents;
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    propertyName: row.property_name,
    houseId: row.house_id,
    houseName: row.house_name,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guestCount: row.guest_count,
    bookerName: row.booker_name ?? '',
    bookerEmail: row.booker_email ?? '',
    bookerPhone: row.booker_phone ?? '',
    guestNote: row.guest_note ?? '',
    paymentMethod: row.payment_method,
    status: row.status,
    totalCents: row.total_cents ?? computed,
    currencyCode: row.currency_code,
    requestNames: row.request_names ?? [],
    kind: row.kind,
    arrivalStatus: row.arrival_status,
    rebookOfId: row.rebook_of_id,
    reference: referenceFor(row.id),
    paidCents: row.paid_cents ?? 0,
    termsAcceptedAt: row.terms_accepted_at === null ? null : row.terms_accepted_at.toISOString(),
    cancellation: deriveCancellation(row),
    replacedByReference: row.replaced_by_id === null ? null : referenceFor(row.replaced_by_id),
    rebookOfReference: row.rebook_of_id === null ? null : referenceFor(row.rebook_of_id),
    refunds,
    changes,
  };
}
