/**
 * @file apps/api/src/modules/extras/extras.repository.ts
 * @feature extras
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { ExtraService, ExtraServiceWrite } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';

interface ExtraRow {
  id: string;
  organization_id: string;
  property_id: string;
  name: string;
  description: string;
  kind: ExtraService['kind'];
  price_cents: number;
  currency_code: string;
  published: boolean;
}

@Injectable()
export class ExtrasRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Catalog for one property.
   */
  public async listByProperty(propertyId: string): Promise<ExtraService[]> {
    const result = await this.database.query<ExtraRow>(
      `
      SELECT id, organization_id, property_id, name, description, kind, price_cents, currency_code, published
      FROM extra_services
      WHERE property_id = $1
      ORDER BY name ASC
      `,
      [propertyId],
    );
    return result.rows.map(mapExtra);
  }

  /**
   * Inserts an extra owned by the property's organization.
   */
  public async create(organizationId: string, propertyId: string, input: ExtraServiceWrite): Promise<ExtraService> {
    const result = await this.database.query<ExtraRow>(
      `
      INSERT INTO extra_services (
        organization_id, property_id, name, description, kind, price_cents, currency_code, published
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, organization_id, property_id, name, description, kind, price_cents, currency_code, published
      `,
      [
        organizationId,
        propertyId,
        input.name,
        input.description,
        input.kind,
        input.priceCents,
        input.currencyCode,
        input.published,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Extra insert returned no row');
    }
    return mapExtra(row);
  }

  /**
   * Updates an extra if it belongs to the property.
   */
  public async update(extraId: string, input: ExtraServiceWrite): Promise<ExtraService | null> {
    const result = await this.database.query<ExtraRow>(
      `
      UPDATE extra_services SET
        name = $2, description = $3, kind = $4, price_cents = $5, currency_code = $6, published = $7
      WHERE id = $1
      RETURNING id, organization_id, property_id, name, description, kind, price_cents, currency_code, published
      `,
      [
        extraId,
        input.name,
        input.description,
        input.kind,
        input.priceCents,
        input.currencyCode,
        input.published,
      ],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapExtra(row);
  }

  /**
   * Removes an extra.
   */
  public async delete(extraId: string): Promise<boolean> {
    const result = await this.database.query('DELETE FROM extra_services WHERE id = $1', [extraId]);
    return (result.rowCount ?? 0) > 0;
  }
}

function mapExtra(row: ExtraRow): ExtraService {
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    priceCents: row.price_cents,
    currencyCode: row.currency_code,
    published: row.published,
  };
}
