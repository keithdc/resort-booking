/**
 * @file apps/api/src/modules/health/health.controller.ts
 * @feature health
 * @dependencies HealthService, StaffGuard
 */

import { Controller, Get, UseGuards } from '@nestjs/common';
import type { HealthStatus } from '@resort-booking/shared-types';
import { StaffGuard } from '../identity/staff.guard';
import { HealthService } from './health.service';
import { TenantExempt } from '../../shared/tenancy/tenant-scope.decorator';
import { RoleGuard } from '../../shared/roles/role.guard';
import { RequireRole } from '../../shared/roles/roles.decorator';

/** What anyone may learn: is the service up. Nothing about what it is built from or what is down. */
export interface PublicHealth {
  ok: boolean;
}

@Controller()
export class HealthController {
  public constructor(private readonly health: HealthService) {}

  /**
   * Public liveness for uptime monitors and load balancers: one boolean. Which dependency failed, and whether
   * the build is behind the database schema, is not for the public (see the staff route below).
   */
  @Get('health')
  public async getHealth(): Promise<PublicHealth> {
    return { ok: (await this.health.getStatus()).ok };
  }

  /**
   * Full detail for staff: Postgres, Redis, and whether this build is older than the database schema.
   */
  @Get('staff/system/health')
  @RequireRole('admin')
  @UseGuards(StaffGuard, RoleGuard)
  @TenantExempt('system status of this server: no organization data')
  public getDetailedHealth(): Promise<HealthStatus> {
    return this.health.getStatus();
  }
}
