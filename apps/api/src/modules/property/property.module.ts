/**
 * @file apps/api/src/modules/property/property.module.ts
 * @feature property
 * @dependencies PropertyController, PropertyService, PropertyRepository
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';

@Module({
  imports: [IdentityModule],
  controllers: [PropertyController],
  providers: [PropertyService, PropertyRepository],
  exports: [PropertyRepository],
})
export class PropertyModule {}
