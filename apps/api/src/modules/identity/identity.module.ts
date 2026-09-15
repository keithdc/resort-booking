/**
 * @file apps/api/src/modules/identity/identity.module.ts
 * @feature identity
 * @dependencies IdentityController, IdentityService, StaffGuard
 */

import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { StaffGuard } from './staff.guard';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, IdentityRepository, StaffGuard],
  exports: [StaffGuard, IdentityService],
})
export class IdentityModule {}
