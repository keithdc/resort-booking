/**
 * @file apps/api/src/modules/property/property.module.ts
 * @feature property
 * @dependencies PropertyController, PropertyService, PropertyRepository
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { GeocodeLimiter } from './geocode-limiter';
import { GeocodeService } from './geocode.service';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';

@Module({
  imports: [IdentityModule],
  controllers: [PropertyController],
  providers: [PropertyService, PropertyRepository, GeocodeService, GeocodeLimiter],
  exports: [PropertyRepository, PropertyService],
})
export class PropertyModule {}
