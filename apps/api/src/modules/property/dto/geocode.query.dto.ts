/**
 * @file apps/api/src/modules/property/dto/geocode.query.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { IsString, MinLength } from 'class-validator';

export class GeocodeQueryDto {
  @IsString()
  @MinLength(3)
  public q!: string;
}
