/**
 * @file apps/api/src/modules/health/health.service.ts
 * @feature health
 * @dependencies DatabaseService, RedisService
 */

import { Injectable } from '@nestjs/common';
import type { HealthStatus } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';

@Injectable()
export class HealthService {
  public constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Reports Postgres and Redis reachability.
   */
  public async getStatus(): Promise<HealthStatus> {
    const postgres = await this.database.ping();
    const redis = await this.redis.ping();
    return { ok: postgres && redis, postgres, redis };
  }
}
