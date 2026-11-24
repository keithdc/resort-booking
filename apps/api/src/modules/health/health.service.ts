/**
 * @file apps/api/src/modules/health/health.service.ts
 * @feature health
 * @dependencies DatabaseService, RedisService
 */

import { Injectable } from '@nestjs/common';
import type { HealthStatus } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { MigrationRunner } from '../../shared/database/migration-runner';
import { RedisService } from '../../shared/redis/redis.service';

@Injectable()
export class HealthService {
  public constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly migrations: MigrationRunner,
  ) {}

  /**
   * Reports Postgres and Redis reachability, and whether this build is older than the database schema.
   */
  public async getStatus(): Promise<HealthStatus> {
    const postgres = await this.database.ping();
    const redis = await this.redis.ping();
    const schemaAheadOf = postgres ? (await this.migrations.status()).unknown : [];
    const schema = schemaAheadOf.length === 0;
    return { ok: postgres && redis && schema, postgres, redis, schema, schemaAheadOf };
  }
}
