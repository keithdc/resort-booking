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
  StaffReservation,
} from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import type { PolicySnapshot } from './reservations.rules';

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
}

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
   * Confirmed stays overlapping [from, to).
   */
  public async listConfirmedOverlapping(
    from: string,
    to: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      SELECT ib.id, ib.organization_id, ib.property_id, p.name AS property_name,
        ib.house_id, h.name AS house_name,
        to_char(ib.check_in, 'YYYY-MM-DD') AS check_in,
        to_char(ib.check_out, 'YYYY-MM-DD') AS check_out, ib.guest_count,
        ib.booker_name, ib.booker_email, ib.booker_phone, COALESCE(ib.guest_note, '') AS guest_note, ib.payment_method, ib.status,
        ib.total_cents, ib.currency_code, h.nightly_rate_cents,
        ib.kind, ib.rebook_of_id, ib.arrival_status,
        COALESCE((
          SELECT array_agg(pro.name ORDER BY pro.name)
          FROM inventory_block_requests ibr
          INNER JOIN property_request_options pro ON pro.id = ibr.request_option_id
          WHERE ibr.inventory_block_id = ib.id
        ), ARRAY[]::text[]) AS request_names
      FROM inventory_blocks ib
      INNER JOIN properties p ON p.id = ib.property_id
      INNER JOIN houses h ON h.id = ib.house_id
      WHERE ib.kind = 'reservation'
        AND ib.status = 'confirmed'
        AND daterange(ib.check_in, ib.check_out, '[)') && daterange($1::date, $2::date, '[)')
        AND ($3::uuid IS NULL OR ib.property_id = $3)
      ORDER BY ib.check_in ASC, h.name ASC
      `,
      [from, to, propertyId],
    );
    return result.rows.map(mapReservation);
  }

  /**
   * Confirmed stays occupying a single night.
   */
  public async listConfirmedOnDate(
    onDate: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      SELECT ib.id, ib.organization_id, ib.property_id, p.name AS property_name,
        ib.house_id, h.name AS house_name,
        to_char(ib.check_in, 'YYYY-MM-DD') AS check_in,
        to_char(ib.check_out, 'YYYY-MM-DD') AS check_out, ib.guest_count,
        ib.booker_name, ib.booker_email, ib.booker_phone, COALESCE(ib.guest_note, '') AS guest_note, ib.payment_method, ib.status,
        ib.total_cents, ib.currency_code, h.nightly_rate_cents,
        ib.kind, ib.rebook_of_id, ib.arrival_status,
        COALESCE((
          SELECT array_agg(pro.name ORDER BY pro.name)
          FROM inventory_block_requests ibr
          INNER JOIN property_request_options pro ON pro.id = ibr.request_option_id
          WHERE ibr.inventory_block_id = ib.id
        ), ARRAY[]::text[]) AS request_names
      FROM inventory_blocks ib
      INNER JOIN properties p ON p.id = ib.property_id
      INNER JOIN houses h ON h.id = ib.house_id
      WHERE ib.kind = 'reservation'
        AND ib.status = 'confirmed'
        AND ib.check_in <= $1::date
        AND ib.check_out > $1::date
        AND ($2::uuid IS NULL OR ib.property_id = $2)
      ORDER BY p.name ASC, h.name ASC
      `,
      [onDate, propertyId],
    );
    return result.rows.map(mapReservation);
  }

  /**
   * Booked, pending, cancelled, and rebooked stays occupying a single night.
   */
  public async listPipelineOnDate(
    onDate: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      SELECT ib.id, ib.organization_id, ib.property_id, p.name AS property_name,
        ib.house_id, h.name AS house_name,
        to_char(ib.check_in, 'YYYY-MM-DD') AS check_in,
        to_char(ib.check_out, 'YYYY-MM-DD') AS check_out, ib.guest_count,
        ib.booker_name, ib.booker_email, ib.booker_phone, COALESCE(ib.guest_note, '') AS guest_note, ib.payment_method, ib.status,
        ib.total_cents, ib.currency_code, h.nightly_rate_cents,
        ib.kind, ib.rebook_of_id, ib.arrival_status,
        COALESCE((
          SELECT array_agg(pro.name ORDER BY pro.name)
          FROM inventory_block_requests ibr
          INNER JOIN property_request_options pro ON pro.id = ibr.request_option_id
          WHERE ibr.inventory_block_id = ib.id
        ), ARRAY[]::text[]) AS request_names
      FROM inventory_blocks ib
      INNER JOIN properties p ON p.id = ib.property_id
      INNER JOIN houses h ON h.id = ib.house_id
      WHERE ib.kind IN ('hold', 'reservation')
        AND ib.status IN ('confirmed', 'cancelled', 'active', 'released')
        AND ib.check_in <= $1::date
        AND ib.check_out > $1::date
        AND ($2::uuid IS NULL OR ib.property_id = $2)
      ORDER BY p.name ASC, h.name ASC
      `,
      [onDate, propertyId],
    );
    return result.rows.map(mapReservation);
  }

  /**
   * Holds and reservations in the window, including unpaid, released, and cancelled.
   */
  public async listPipelineOverlapping(
    from: string,
    to: string,
    propertyId: string | null,
  ): Promise<StaffReservation[]> {
    const result = await this.database.query<ReservationRow>(
      `
      SELECT ib.id, ib.organization_id, ib.property_id, p.name AS property_name,
        ib.house_id, h.name AS house_name,
        to_char(ib.check_in, 'YYYY-MM-DD') AS check_in,
        to_char(ib.check_out, 'YYYY-MM-DD') AS check_out, ib.guest_count,
        ib.booker_name, ib.booker_email, ib.booker_phone, COALESCE(ib.guest_note, '') AS guest_note, ib.payment_method, ib.status,
        ib.total_cents, ib.currency_code, h.nightly_rate_cents,
        ib.kind, ib.rebook_of_id, ib.arrival_status,
        COALESCE((
          SELECT array_agg(pro.name ORDER BY pro.name)
          FROM inventory_block_requests ibr
          INNER JOIN property_request_options pro ON pro.id = ibr.request_option_id
          WHERE ibr.inventory_block_id = ib.id
        ), ARRAY[]::text[]) AS request_names
      FROM inventory_blocks ib
      INNER JOIN properties p ON p.id = ib.property_id
      INNER JOIN houses h ON h.id = ib.house_id
      WHERE ib.kind IN ('hold', 'reservation')
        AND daterange(ib.check_in, ib.check_out, '[)') && daterange($1::date, $2::date, '[)')
        AND ($3::uuid IS NULL OR ib.property_id = $3)
      ORDER BY ib.check_in ASC, h.name ASC
      `,
      [from, to, propertyId],
    );
    return result.rows.map(mapReservation);
  }

  /**
   * Houses that can sell nights in this report (published or not — staff view).
   */
  public async countHouses(propertyId: string | null): Promise<number> {
    const result = await this.database.query<{ n: string }>(
      `
      SELECT COUNT(*)::text AS n
      FROM houses h
      INNER JOIN properties p ON p.id = h.property_id
      WHERE ($1::uuid IS NULL OR p.id = $1)
      `,
      [propertyId],
    );
    return Number.parseInt(result.rows[0]?.n ?? '0', 10);
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
   * One stay for staff arrival actions.
   */
  public async getById(id: string): Promise<StaffReservation | null> {
    const result = await this.database.query<ReservationRow>(
      `
      SELECT ib.id, ib.organization_id, ib.property_id, p.name AS property_name,
        ib.house_id, h.name AS house_name,
        to_char(ib.check_in, 'YYYY-MM-DD') AS check_in,
        to_char(ib.check_out, 'YYYY-MM-DD') AS check_out, ib.guest_count,
        ib.booker_name, ib.booker_email, ib.booker_phone, COALESCE(ib.guest_note, '') AS guest_note, ib.payment_method, ib.status,
        ib.total_cents, ib.currency_code, h.nightly_rate_cents,
        ib.kind, ib.rebook_of_id, ib.arrival_status,
        COALESCE((
          SELECT array_agg(pro.name ORDER BY pro.name)
          FROM inventory_block_requests ibr
          INNER JOIN property_request_options pro ON pro.id = ibr.request_option_id
          WHERE ibr.inventory_block_id = ib.id
        ), ARRAY[]::text[]) AS request_names
      FROM inventory_blocks ib
      INNER JOIN properties p ON p.id = ib.property_id
      INNER JOIN houses h ON h.id = ib.house_id
      WHERE ib.id = $1
      `,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapReservation(row);
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

function mapReservation(row: ReservationRow): StaffReservation {
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
  };
}
