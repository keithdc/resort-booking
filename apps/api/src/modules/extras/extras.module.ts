/**
 * @file apps/api/src/modules/extras/extras.module.ts
 * @feature extras
 * @dependencies PropertyModule, IdentityModule
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PropertyModule } from '../property/property.module';
import { ExtrasController } from './extras.controller';
import { ExtrasRepository } from './extras.repository';
import { ExtrasService } from './extras.service';
import { ReservationExtrasRepository } from './reservation-extras.repository';

@Module({
  imports: [IdentityModule, PropertyModule],
  controllers: [ExtrasController],
  providers: [ExtrasService, ExtrasRepository, ReservationExtrasRepository],
  exports: [ExtrasRepository, ReservationExtrasRepository],
})
export class ExtrasModule {}
