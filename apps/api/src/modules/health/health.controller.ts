/**
 * @file apps/api/src/modules/health/health.controller.ts
 * @feature health
 * @dependencies HealthService
 */

import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@resort-booking/shared-types';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  public constructor(private readonly health: HealthService) {}

  /**
   * Liveness and dependency ping.
   */
  @Get()
  public getHealth(): Promise<HealthStatus> {
    return this.health.getStatus();
  }
}
