/**
 * @file apps/api/src/modules/property/dto/geocode-reverse.query.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { QueryNumber } from '../../../shared/validation/query-number';
import { IsNumber, Max, Min } from 'class-validator';

export class GeocodeReverseQueryDto {
  @QueryNumber()
  @IsNumber()
  @Min(-90)
  @Max(90)
  public lat!: number;

  @QueryNumber()
  @IsNumber()
  @Min(-180)
  @Max(180)
  public lon!: number;
}
