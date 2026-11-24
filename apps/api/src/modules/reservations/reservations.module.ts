/**
 * @file apps/api/src/modules/reservations/reservations.module.ts
 * @feature reservations
 * @dependencies IdentityModule
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PropertyModule } from '../property/property.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsPublicController } from './reservations.public.controller';
import { ReservationsRepository } from './reservations.repository';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [IdentityModule, PropertyModule],
  controllers: [ReservationsController, ReservationsPublicController],
  providers: [ReservationsService, ReservationsRepository],
  exports: [ReservationsService],
})
export class ReservationsModule {}
