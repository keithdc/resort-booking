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

@Module({
  imports: [IdentityModule, PropertyModule],
  controllers: [DiscountsController],
  providers: [DiscountsService, DiscountsRepository],
  exports: [DiscountsService],
})
export class DiscountsModule {}
