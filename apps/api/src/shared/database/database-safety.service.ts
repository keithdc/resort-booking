/**
 * @file apps/api/src/shared/database/database-safety.service.ts
 * @shared Startup check: the database role the API runs as must be least-privilege
 * @dependencies DatabaseService
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { QueryResult } from 'pg';
import { isProduction } from '../config/environment';
import { DatabaseService } from './database.service';
import {
  assessRuntimeRole,
  roleFactsFromRow,
  RUNTIME_ROLE_QUERY,
  type RoleAssessment,
  type RuntimeRoleRow,
} from './role-safety';

@Injectable()
export class DatabaseSafetyService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSafetyService.name);

  public constructor(private readonly database: DatabaseService) {}

  /**
   * Production refuses to start when the runtime role is a superuser, can create roles or databases, or owns tables.
   * Development logs the same findings as warnings.
   */
  public async onModuleInit(): Promise<void> {
    const assessment = await this.assess(isProduction(process.env));
    for (const warning of assessment.warnings) {
      this.logger.warn(warning);
    }
    if (assessment.errors.length > 0) {
      throw new Error(`Refusing to start, the database role is unsafe:\n- ${assessment.errors.join('\n- ')}`);
    }
  }

  /**
   * Asks Postgres who the API is connected as and judges it.
   */
  public async assess(production: boolean): Promise<RoleAssessment> {
    const result: QueryResult<RuntimeRoleRow> = await this.database.query<RuntimeRoleRow>(RUNTIME_ROLE_QUERY);
    const row = result.rows[0];
    if (row === undefined) {
      return { errors: production ? ['Could not read the database role the API runs as.'] : [], warnings: production ? [] : ['Could not read the database role the API runs as.'] };
    }
    return assessRuntimeRole(roleFactsFromRow(row), production);
  }
}
