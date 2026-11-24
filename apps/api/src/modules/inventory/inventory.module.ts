/**
 * @file apps/api/src/modules/inventory/inventory.module.ts
 * @feature inventory
 * @dependencies PropertyModule, InventoryService
 */

import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RatesModule } from '../rates/rates.module';
import { AvailabilityService } from './availability.service';
import { HoldSweeperService } from './hold-sweeper.service';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

@Module({
  imports: [PropertyModule, RatesModule],
  controllers: [InventoryController],
  providers: [InventoryService, AvailabilityService, HoldSweeperService, InventoryRepository],
})
export class InventoryModule {}
