/**
 * @file apps/api/src/shared/tenancy/tenancy.repository.ts
 * @shared One-statement ownership checks, one fixed query per resource
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TenantResource } from './tenant-scope.decorator';

/**
 * Fixed statements only: the table is never built from input. Every table carries `organization_id`.
 * `booking` means a reservation (not a hold).
 */
const OWNS_ONE: Record<TenantResource, string> = {
  property: 'SELECT 1 FROM properties WHERE id = $1::uuid AND organization_id = $2::uuid',
  house: 'SELECT 1 FROM houses WHERE id = $1::uuid AND organization_id = $2::uuid',
  ratePeriod: 'SELECT 1 FROM rate_periods WHERE id = $1::uuid AND organization_id = $2::uuid',
  discount: 'SELECT 1 FROM discounts WHERE id = $1::uuid AND organization_id = $2::uuid',
  extra: 'SELECT 1 FROM extra_services WHERE id = $1::uuid AND organization_id = $2::uuid',
  requestOption: 'SELECT 1 FROM property_request_options WHERE id = $1::uuid AND organization_id = $2::uuid',
  booking: "SELECT 1 FROM inventory_blocks WHERE id = $1::uuid AND organization_id = $2::uuid AND kind = 'reservation'",
  refund: 'SELECT 1 FROM refunds WHERE id = $1::uuid AND organization_id = $2::uuid',
  staffUser: 'SELECT 1 FROM staff_users WHERE id = $1::uuid AND organization_id = $2::uuid',
  staffInvite: 'SELECT 1 FROM staff_invites WHERE id = $1::uuid AND organization_id = $2::uuid',
};

const COUNT_OWNED: Record<TenantResource, string> = {
  property: 'SELECT count(*)::int AS n FROM properties WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  house: 'SELECT count(*)::int AS n FROM houses WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  ratePeriod: 'SELECT count(*)::int AS n FROM rate_periods WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  discount: 'SELECT count(*)::int AS n FROM discounts WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  extra: 'SELECT count(*)::int AS n FROM extra_services WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  requestOption:
    'SELECT count(*)::int AS n FROM property_request_options WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  booking:
    "SELECT count(*)::int AS n FROM inventory_blocks WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid AND kind = 'reservation'",
  refund: 'SELECT count(*)::int AS n FROM refunds WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  staffUser: 'SELECT count(*)::int AS n FROM staff_users WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
  staffInvite: 'SELECT count(*)::int AS n FROM staff_invites WHERE id = ANY($1::uuid[]) AND organization_id = $2::uuid',
};

@Injectable()
export class TenancyRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * True when the row exists AND belongs to the organization.
   */
  public async owns(resource: TenantResource, organizationId: string, id: string): Promise<boolean> {
    const result = await this.database.query(OWNS_ONE[resource], [id, organizationId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * How many of the (distinct) ids belong to the organization, in one statement.
   */
  public async countOwned(resource: TenantResource, organizationId: string, ids: readonly string[]): Promise<number> {
    const result = await this.database.query<{ n: number }>(COUNT_OWNED[resource], [[...ids], organizationId]);
    return result.rows[0]?.n ?? 0;
  }
}
