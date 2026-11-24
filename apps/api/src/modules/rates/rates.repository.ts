/**
 * @file apps/api/src/modules/rates/rates.repository.ts
 * @feature rates
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { RatePeriod, RatePeriodWrite } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';

interface RatePeriodRow {
  id: string;
  house_id: string;
  property_id: string;
  label: string;
  start_date: string;
  end_date: string;
  nightly_rate_cents: number;
}

export interface HouseScope {
  organizationId: string;
  propertyId: string;
  houseId: string;
}

export interface HouseConflictRow {
  house_id: string;
  label: string;
  start_date: string;
  end_date: string;
}

export interface BulkAuditInput {
  organizationId: string;
  propertyId: string;
  staffAccountId: string | null;
  write: RatePeriodWrite;
  addedHouseIds: string[];
  skippedHouseIds: string[];
}

const COLUMNS = `id, house_id, property_id, label, start_date::text AS start_date,
  end_date::text AS end_date, nightly_rate_cents`;

@Injectable()
export class RatesRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * All periods on one house, soonest first.
   */
  public async listForHouse(houseId: string): Promise<RatePeriod[]> {
    const result = await this.database.query<RatePeriodRow>(
      `SELECT ${COLUMNS} FROM rate_periods WHERE house_id = $1 ORDER BY start_date`,
      [houseId],
    );
    return result.rows.map(mapPeriod);
  }

  /**
   * Every period on every house of a property in ONE query, grouped by the caller.
   * Powers the houses list so it never asks house by house.
   */
  public async listForProperty(propertyId: string): Promise<RatePeriod[]> {
    const result = await this.database.query<RatePeriodRow>(
      `SELECT ${COLUMNS} FROM rate_periods WHERE property_id = $1 ORDER BY house_id, start_date`,
      [propertyId],
    );
    return result.rows.map(mapPeriod);
  }

  /**
   * Periods touching [from, to] (inclusive nights) for many houses in ONE query.
   */
  public async listForHouses(houseIds: readonly string[], from: string, to: string): Promise<RatePeriod[]> {
    if (houseIds.length === 0) {
      return [];
    }
    const result = await this.database.query<RatePeriodRow>(
      `
      SELECT ${COLUMNS}
      FROM rate_periods
      WHERE house_id = ANY($1::uuid[])
        AND start_date <= $3::date
        AND end_date >= $2::date
      ORDER BY house_id, start_date
      `,
      [houseIds, from, to],
    );
    return result.rows.map(mapPeriod);
  }

  /**
   * One period by id.
   */
  public async getById(periodId: string): Promise<RatePeriod | null> {
    const result = await this.database.query<RatePeriodRow>(
      `SELECT ${COLUMNS} FROM rate_periods WHERE id = $1`,
      [periodId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapPeriod(row);
  }

  /**
   * Inserts one period. An exclusion-constraint violation (23P01) means a clash; the caller maps it.
   */
  public async insert(scope: HouseScope, write: RatePeriodWrite): Promise<RatePeriod> {
    const result = await this.database.query<RatePeriodRow>(
      `
      INSERT INTO rate_periods (organization_id, property_id, house_id, label, start_date, end_date, nightly_rate_cents)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${COLUMNS}
      `,
      [scope.organizationId, scope.propertyId, scope.houseId, write.label.trim(), write.startDate, write.endDate, write.nightlyRateCents],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Rate period insert returned no row');
    }
    return mapPeriod(row);
  }

  /**
   * Updates a period in place. Null when it no longer exists.
   */
  public async update(periodId: string, write: RatePeriodWrite): Promise<RatePeriod | null> {
    const result = await this.database.query<RatePeriodRow>(
      `
      UPDATE rate_periods
      SET label = $2, start_date = $3, end_date = $4, nightly_rate_cents = $5
      WHERE id = $1
      RETURNING ${COLUMNS}
      `,
      [periodId, write.label.trim(), write.startDate, write.endDate, write.nightlyRateCents],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapPeriod(row);
  }

  /**
   * Deletes a period. False when it was already gone.
   */
  public async delete(periodId: string): Promise<boolean> {
    const result = await this.database.query('DELETE FROM rate_periods WHERE id = $1', [periodId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * For each house, the first existing period that shares a night with the range. One query.
   */
  public async listConflictsForHouses(
    houseIds: readonly string[],
    startDate: string,
    endDate: string,
  ): Promise<HouseConflictRow[]> {
    if (houseIds.length === 0) {
      return [];
    }
    const result = await this.database.query<HouseConflictRow>(
      `
      SELECT DISTINCT ON (house_id) house_id, label, start_date::text AS start_date, end_date::text AS end_date
      FROM rate_periods
      WHERE house_id = ANY($1::uuid[])
        AND start_date <= $3::date
        AND end_date >= $2::date
      ORDER BY house_id, start_date
      `,
      [houseIds, startDate, endDate],
    );
    return result.rows;
  }

  /**
   * Runs the callback in one transaction: all houses get the period, or none do.
   */
  public async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.database.withClient(async (client): Promise<T> => {
      await client.query('BEGIN');
      try {
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  /**
   * One statement inserts the period for every house (no per-house loop).
   */
  public async insertForHouses(client: PoolClient, scopes: readonly HouseScope[], write: RatePeriodWrite): Promise<void> {
    if (scopes.length === 0) {
      return;
    }
    await client.query(
      `
      INSERT INTO rate_periods (organization_id, property_id, house_id, label, start_date, end_date, nightly_rate_cents)
      SELECT organization_id, property_id, house_id, $4, $5::date, $6::date, $7
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS t(organization_id, property_id, house_id)
      `,
      [
        scopes.map((scope): string => scope.organizationId),
        scopes.map((scope): string => scope.propertyId),
        scopes.map((scope): string => scope.houseId),
        write.label.trim(),
        write.startDate,
        write.endDate,
        write.nightlyRateCents,
      ],
    );
  }

  /**
   * Records who applied a period to many houses.
   */
  public async insertBulkAudit(client: PoolClient, input: BulkAuditInput): Promise<void> {
    await client.query(
      `
      INSERT INTO rate_period_bulk_applications (
        organization_id, property_id, staff_account_id, label, start_date, end_date,
        nightly_rate_cents, added_house_ids, skipped_house_ids
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9::uuid[])
      `,
      [
        input.organizationId,
        input.propertyId,
        input.staffAccountId,
        input.write.label.trim(),
        input.write.startDate,
        input.write.endDate,
        input.write.nightlyRateCents,
        input.addedHouseIds,
        input.skippedHouseIds,
      ],
    );
  }
}

function mapPeriod(row: RatePeriodRow): RatePeriod {
  return {
    id: row.id,
    houseId: row.house_id,
    propertyId: row.property_id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    nightlyRateCents: row.nightly_rate_cents,
  };
}
