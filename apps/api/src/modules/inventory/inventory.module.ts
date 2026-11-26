/**
 * @file apps/api/src/modules/inventory/inventory.module.ts
 * @feature inventory
 * @dependencies PropertyModule, InventoryService
 */

import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { ExtrasModule } from '../extras/extras.module';
import { PropertyModule } from '../property/property.module';
import { RatesModule } from '../rates/rates.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AvailabilityService } from './availability.service';
import { HoldRateLimiter } from './hold-rate-limiter';
import { HoldSweeperService } from './hold-sweeper.service';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { PromoRateLimiter } from './promo-rate-limiter';
import { StaffBookingCreator } from './staff-booking-creator';

@Module({
  imports: [PropertyModule, RatesModule, DiscountsModule, ReservationsModule, ExtrasModule],
  controllers: [InventoryController],
  providers: [InventoryService, AvailabilityService, HoldSweeperService, InventoryRepository, PromoRateLimiter, HoldRateLimiter, StaffBookingCreator],
  exports: [InventoryService, AvailabilityService, StaffBookingCreator],
})
export class InventoryModule {}
