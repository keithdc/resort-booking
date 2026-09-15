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
   * Inserts a hold row inside a transaction. Caller maps unique-violation to conflict.
   */
  public async insertHold(client: PoolClient, input: InsertHoldInput): Promise<HoldRow> {
    const result = await client.query<HoldRow>(
      `
      INSERT INTO inventory_blocks (
        organization_id, property_id, house_id, kind, status,
        check_in, check_out, guest_count, payment_method, expires_at,
        booker_name, booker_email, booker_phone, guest_note
      ) VALUES (
        $1, $2, $3, 'hold', 'active',
        $4, $5, $6, $7, $8,
        $9, $10, $11, $12
      )
      RETURNING id, organization_id, property_id, house_id, status,
        check_in::text, check_out::text, guest_count, payment_method, expires_at,
        booker_name, booker_email, booker_phone, guest_note
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
        booker_name, booker_email, booker_phone, guest_note
      FROM inventory_blocks
      WHERE id = $1 AND kind = 'hold'
      `,
      [holdId],
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
