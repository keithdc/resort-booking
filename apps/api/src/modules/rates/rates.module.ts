/**
 * @file apps/api/src/modules/rates/rates.module.ts
 * @feature rates
 * @dependencies IdentityModule, PropertyModule
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PropertyModule } from '../property/property.module';
import { RatesController } from './rates.controller';
import { RatesRepository } from './rates.repository';
import { RatesService } from './rates.service';

@Module({
  imports: [IdentityModule, PropertyModule],
  controllers: [RatesController],
  providers: [RatesService, RatesRepository],
  exports: [RatesService],
})
export class RatesModule {}
