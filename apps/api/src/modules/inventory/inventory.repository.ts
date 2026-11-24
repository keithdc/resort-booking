/**
 * @file apps/api/src/modules/inventory/inventory.repository.ts
 * @feature inventory
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { HoldStatus, PaymentMethod } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';

export interface HoldRow {
  id: string;
  organization_id: string;
  property_id: string;
  house_id: string;
  status: HoldStatus;
  check_in: string;
  check_out: string;
  guest_count: number;
  payment_method: PaymentMethod;
  expires_at: Date;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  guest_note: string;
  /** JSON of the quoted price, or null for holds made before snapshots existed. */
  price_snapshot: unknown;
}

/** A confirmed stay, as the guest confirmation needs it. */
export interface StayRow {
  id: string;
  organization_id: string;
  property_id: string;
  house_id: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  total_cents: number | null;
  currency_code: string | null;
  booker_name: string | null;
  booker_email: string | null;
}

export interface OccupiedRangeRow {
  house_id: string;
  check_in: string;
  check_out: string;
}

interface InsertHoldInput {
  organizationId: string;
  propertyId: string;
  houseId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  paymentMethod: PaymentMethod;
  expiresAt: Date;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  guestNote: string;
  totalCents: number;
  currencyCode: string;
  /** JSON text of the quoted price lines. */
  priceSnapshot: string;
  /** When the guest accepted the cancellation terms (the server clock). */
  termsAcceptedAt: Date;
  /** JSON text of the cancellation policy in force when the guest booked. */
  policySnapshot: string;
}

@Injectable()
export class InventoryRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Expires overdue holds so the gist exclusion can reuse the dates.
   */
  public async expireOverdueHolds(houseId: string): Promise<void> {
    await this.database.query(
      `
      UPDATE inventory_blocks
      SET status = 'expired'
      WHERE house_id = $1
        AND kind = 'hold'
        AND status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < now()
      `,
      [houseId],
    );
  }

  /**
   * Marks every overdue hold expired in one statement, across all houses.
   * Idempotent: running it twice (or from two instances) expires each hold once.
   * Returns how many holds this call expired.
   */
  public async expireAllOverdueHolds(): Promise<number> {
    const result = await this.database.query(
      `
      UPDATE inventory_blocks
      SET status = 'expired'
      WHERE kind = 'hold'
        AND status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < now()
      `,
    );
    return result.rowCount ?? 0;
  }

  /**
   * True when an active hold or confirmed stay overlaps the range.
   */
  public async hasOverlap(
    houseId: string,
    checkIn: string,
    checkOut: string,
    excludeId: string | null,
  ): Promise<boolean> {
    const result = await this.database.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM inventory_blocks
        WHERE house_id = $1
          AND status IN ('active', 'confirmed')
          AND daterange(check_in, check_out, '[)') && daterange($2::date, $3::date, '[)')
          AND ($4::uuid IS NULL OR id <> $4)
      ) AS exists
      `,
      [houseId, checkIn, checkOut, excludeId],
    );
    return result.rows[0]?.exists === true;
  }

  /**
   * Occupied night ranges for many houses in one query (no per-house loop). `excludeBlockId` leaves one
   * booking out, so a guest changing their dates sees their own current nights as free.
   * Counts confirmed stays, staff blocks, and holds that have not timed out. Read-only:
   * overdue holds are filtered by clock here instead of being expired on a GET.
   */
  public async listOccupiedRanges(
    houseIds: readonly string[],
    from: string,
    to: string,
    excludeBlockId: string | null = null,
  ): Promise<OccupiedRangeRow[]> {
    if (houseIds.length === 0) {
      return [];
    }
    const result = await this.database.query<OccupiedRangeRow>(
      `
      SELECT house_id, check_in::text AS check_in, check_out::text AS check_out
      FROM inventory_blocks
      WHERE house_id = ANY($1::uuid[])
        AND status IN ('active', 'confirmed')
        AND NOT (kind = 'hold' AND expires_at IS NOT NULL AND expires_at < now())
        AND daterange(check_in, check_out, '[)') && daterange($2::date, $3::date, '[)')
        AND ($4::uuid IS NULL OR id <> $4)
      ORDER BY house_id, check_in
      `,
      [houseIds, from, to, excludeBlockId],
    );
    return result.rows;
  }

  /**
   * Inserts a hold row inside a transaction. Caller maps unique-violation to conflict.
   */
  public async insertHold(client: PoolClient, input: InsertHoldInput): Promise<HoldRow> {
    const result = await client.query<HoldRow>(
      `
      INSERT INTO inventory_blocks (
        organization_id, property_id, house_id, kind, status,
        check_in, check_out, guest_count, payment_method, expires_at,
        booker_name, booker_email, booker_phone, guest_note,
        total_cents, currency_code, price_snapshot, policy_snapshot, terms_accepted_at
      ) VALUES (
        $1, $2, $3, 'hold', 'active',
        $4, $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15::jsonb, $16::jsonb, $17
      )
      RETURNING id, organization_id, property_id, house_id, status,
        check_in::text, check_out::text, guest_count, payment_method, expires_at,
        booker_name, booker_email, booker_phone, guest_note, price_snapshot
      `,
      [
        input.organizationId,
        input.propertyId,
        input.houseId,
        input.checkIn,
        input.checkOut,
        input.guestCount,
        input.paymentMethod,
        input.expiresAt,
        input.bookerName,
        input.bookerEmail,
        input.bookerPhone,
        input.guestNote,
        input.totalCents,
        input.currencyCode,
        input.priceSnapshot,
        input.policySnapshot,
        input.termsAcceptedAt,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Hold insert returned no row');
    }
    return row;
  }

  /**
   * Guest-chosen house requests on a hold/stay.
   */
  public async insertBlockRequests(
    client: PoolClient,
    inventoryBlockId: string,
    optionIds: string[],
  ): Promise<void> {
    for (const optionId of optionIds) {
      await client.query(
        `
        INSERT INTO inventory_block_requests (inventory_block_id, request_option_id)
        VALUES ($1, $2)
        `,
        [inventoryBlockId, optionId],
      );
    }
  }

  /**
   * Loads a hold by id.
   */
  public async getHoldById(holdId: string): Promise<HoldRow | null> {
    const result = await this.database.query<HoldRow>(
      `
      SELECT id, organization_id, property_id, house_id, status,
        check_in::text, check_out::text, guest_count, payment_method, expires_at,
        booker_name, booker_email, booker_phone, guest_note, price_snapshot
      FROM inventory_blocks
      WHERE id = $1 AND kind = 'hold'
      `,
      [holdId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Turns a still-valid hold into a confirmed reservation, inside the caller's transaction.
   * Returns null when the hold is no longer active or has timed out: nothing is confirmed.
   */
  public async confirmPaidHold(client: PoolClient, holdId: string): Promise<StayRow | null> {
    const result = await client.query<StayRow>(
      `
      UPDATE inventory_blocks
      SET kind = 'reservation', status = 'confirmed', expires_at = NULL
      WHERE id = $1 AND kind = 'hold' AND status = 'active' AND expires_at > now()
      RETURNING id, organization_id, property_id, house_id, check_in::text, check_out::text, guest_count,
        total_cents, currency_code, booker_name, booker_email
      `,
      [holdId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * A confirmed stay by id, or null.
   */
  public async getConfirmedStay(stayId: string): Promise<StayRow | null> {
    const result = await this.database.query<StayRow>(
      `
      SELECT id, organization_id, property_id, house_id, check_in::text, check_out::text, guest_count,
        total_cents, currency_code, booker_name, booker_email
      FROM inventory_blocks
      WHERE id = $1 AND kind = 'reservation' AND status = 'confirmed'
      `,
      [stayId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Marks a hold released (guest cancelled before pay).
   */
  public async releaseHold(holdId: string): Promise<void> {
    await this.database.query(
      `
      UPDATE inventory_blocks
      SET status = 'released'
      WHERE id = $1 AND kind = 'hold' AND status = 'active'
      `,
      [holdId],
    );
  }
}
