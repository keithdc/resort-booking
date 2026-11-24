/**
 * @file apps/api/src/modules/discounts/discounts.repository.ts
 * @feature discounts
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { Discount, DiscountWrite, QuoteDiscountLine } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { parseConditions } from './discounts.rules';

interface DiscountRow {
  id: string;
  property_id: string;
  label: string;
  effect_kind: 'percent' | 'fixed';
  effect_value: number;
  conditions: unknown;
  always_on: boolean;
  house_ids: string[] | null;
  combinable: boolean;
  priority: number;
  active: boolean;
  max_redemptions: number | null;
  redemptions: number;
}

export interface PropertyScope {
  organizationId: string;
  propertyId: string;
}

// Redemptions are counted in the same statement: no per-discount query.
const SELECT = `
  SELECT d.id, d.property_id, d.label, d.effect_kind, d.effect_value, d.conditions, d.always_on,
    d.house_ids, d.combinable, d.priority, d.active, d.max_redemptions,
    COALESCE(r.used, 0)::int AS redemptions
  FROM discounts d
  LEFT JOIN (
    SELECT discount_id, count(*) AS used FROM discount_redemptions GROUP BY discount_id
  ) r ON r.discount_id = d.id
`;

@Injectable()
export class DiscountsRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Discounts for many properties in ONE query. `activeOnly` is what guests are quoted from.
   */
  public async listForProperties(propertyIds: readonly string[], activeOnly: boolean): Promise<Discount[]> {
    if (propertyIds.length === 0) {
      return [];
    }
    const result = await this.database.query<DiscountRow>(
      `${SELECT} WHERE d.property_id = ANY($1::uuid[]) AND ($2::boolean = false OR d.active) ORDER BY d.priority, d.label`,
      [propertyIds, activeOnly],
    );
    return result.rows.map(mapDiscount);
  }

  /**
   * One discount by id.
   */
  public async getById(discountId: string): Promise<Discount | null> {
    const result = await this.database.query<DiscountRow>(`${SELECT} WHERE d.id = $1`, [discountId]);
    const row = result.rows[0];
    return row === undefined ? null : mapDiscount(row);
  }

  /**
   * Adds a discount to a property.
   */
  public async insert(scope: PropertyScope, write: DiscountWrite): Promise<Discount> {
    const result = await this.database.query<{ id: string }>(
      `
      INSERT INTO discounts (
        organization_id, property_id, label, effect_kind, effect_value, conditions, always_on,
        house_ids, combinable, priority, active, max_redemptions
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::uuid[], $9, $10, $11, $12)
      RETURNING id
      `,
      [scope.organizationId, scope.propertyId, ...writeParams(write)],
    );
    const id = result.rows[0]?.id;
    const created = id === undefined ? null : await this.getById(id);
    if (created === null) {
      throw new Error('Discount insert returned no row');
    }
    return created;
  }

  /**
   * Replaces a discount's settings. Null when it no longer exists.
   */
  public async update(discountId: string, write: DiscountWrite): Promise<Discount | null> {
    const result = await this.database.query(
      `
      UPDATE discounts
      SET label = $2, effect_kind = $3, effect_value = $4, conditions = $5::jsonb, always_on = $6,
        house_ids = $7::uuid[], combinable = $8, priority = $9, active = $10, max_redemptions = $11
      WHERE id = $1
      `,
      [discountId, ...writeParams(write)],
    );
    return (result.rowCount ?? 0) === 0 ? null : this.getById(discountId);
  }

  /**
   * Removes a discount. Booked stays keep the price they were quoted.
   */
  public async delete(discountId: string): Promise<boolean> {
    const result = await this.database.query('DELETE FROM discounts WHERE id = $1', [discountId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Moves discount use from one booking to the one that replaces it: the old booking's rows go, the new
   * booking records the discounts it actually got. The use count of a discount stays right.
   */
  public async replaceRedemptions(
    client: PoolClient,
    fromBookingId: string,
    toBookingId: string,
    lines: readonly QuoteDiscountLine[],
  ): Promise<void> {
    await client.query('DELETE FROM discount_redemptions WHERE inventory_block_id = $1', [fromBookingId]);
    await this.recordRedemptions(client, toBookingId, lines);
  }

  /**
   * Records which discounts a confirmed stay used, in one statement. Safe to repeat.
   */
  public async recordRedemptions(
    client: PoolClient,
    inventoryBlockId: string,
    lines: readonly QuoteDiscountLine[],
  ): Promise<void> {
    if (lines.length === 0) {
      return;
    }
    await client.query(
      `
      INSERT INTO discount_redemptions (discount_id, inventory_block_id, amount_cents)
      SELECT t.discount_id, $1::uuid, t.amount_cents
      FROM unnest($2::uuid[], $3::int[]) AS t(discount_id, amount_cents)
      WHERE EXISTS (SELECT 1 FROM discounts d WHERE d.id = t.discount_id)
      ON CONFLICT (discount_id, inventory_block_id) DO NOTHING
      `,
      [inventoryBlockId, lines.map((line): string => line.discountId), lines.map((line): number => line.amountCents)],
    );
  }
}

function writeParams(write: DiscountWrite): unknown[] {
  return [
    write.label.trim(),
    write.effect.kind,
    write.effect.kind === 'percent' ? write.effect.percent : write.effect.amountCents,
    JSON.stringify(write.conditions),
    write.alwaysOn,
    write.houseIds,
    write.combinable,
    write.priority,
    write.active,
    write.maxRedemptions,
  ];
}

function mapDiscount(row: DiscountRow): Discount {
  // A damaged JSON column must never grant a discount: no conditions and not always-on matches nothing.
  const conditions = parseConditions(row.conditions);
  return {
    id: row.id,
    propertyId: row.property_id,
    label: row.label,
    effect:
      row.effect_kind === 'percent'
        ? { kind: 'percent', percent: row.effect_value }
        : { kind: 'fixed', amountCents: row.effect_value },
    conditions: conditions ?? [],
    alwaysOn: conditions === null ? false : row.always_on,
    houseIds: row.house_ids,
    combinable: row.combinable,
    priority: row.priority,
    active: row.active,
    maxRedemptions: row.max_redemptions,
    redemptions: row.redemptions,
  };
}
