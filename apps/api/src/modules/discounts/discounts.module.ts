/**
 * @file apps/api/src/modules/discounts/discounts.module.ts
 * @feature discounts
 * @dependencies IdentityModule, PropertyModule
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PropertyModule } from '../property/property.module';
import { DiscountsController } from './discounts.controller';
import { DiscountsRepository } from './discounts.repository';
import { DiscountsService } from './discounts.service';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { StaffPromotionsController } from './staff-promotions.controller';

@Module({
  imports: [IdentityModule, PropertyModule],
  controllers: [DiscountsController, OffersController, StaffPromotionsController],
  providers: [DiscountsService, DiscountsRepository, OffersService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
