/**
 * @file apps/api/src/modules/inventory/inventory.module.ts
 * @feature inventory
 * @dependencies PropertyModule, InventoryService
 */

import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { PropertyModule } from '../property/property.module';
import { RatesModule } from '../rates/rates.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AvailabilityService } from './availability.service';
import { HoldSweeperService } from './hold-sweeper.service';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { PromoRateLimiter } from './promo-rate-limiter';

@Module({
  imports: [PropertyModule, RatesModule, DiscountsModule, ReservationsModule],
  controllers: [InventoryController],
  providers: [InventoryService, AvailabilityService, HoldSweeperService, InventoryRepository, PromoRateLimiter],
  exports: [InventoryService],
})
export class InventoryModule {}
