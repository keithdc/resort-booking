/**
 * @file apps/api/src/modules/property/dto/geocode-reverse.query.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class GeocodeReverseQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  public lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  public lon!: number;
}
