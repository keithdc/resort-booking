/**
 * @file apps/api/src/shared/tenancy/tenancy.module.ts
 * @shared Organization isolation for staff routes
 * @dependencies DatabaseModule
 */

import { Global, Module } from '@nestjs/common';
import { TenancyRepository } from './tenancy.repository';
import { TenancyService } from './tenancy.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [TenancyRepository, TenancyService, TenantGuard],
  exports: [TenancyService, TenantGuard],
})
export class TenancyModule {}
