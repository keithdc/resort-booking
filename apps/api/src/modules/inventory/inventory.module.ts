/**
 * @file apps/api/src/modules/inventory/inventory.module.ts
 * @feature inventory
 * @dependencies PropertyModule, InventoryService
 */

import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

@Module({
  imports: [PropertyModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
})
export class InventoryModule {}
