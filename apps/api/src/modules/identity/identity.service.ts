/**
 * @file apps/api/src/modules/identity/identity.service.ts
 * @feature identity
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { Organization } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';

interface OrganizationRow {
  id: string;
  name: string;
}

@Injectable()
export class IdentityService {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Returns the operator organization (stub until staff login exists).
   */
  public async getOrganization(): Promise<Organization | null> {
    const result = await this.database.query<OrganizationRow>(
      'SELECT id, name FROM organizations ORDER BY created_at ASC LIMIT 1',
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return { id: row.id, name: row.name };
  }
}
