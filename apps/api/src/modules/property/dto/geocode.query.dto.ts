/**
 * @file apps/api/src/modules/property/dto/geocode.query.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

export class GeocodeQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(LIMITS.searchText)
  public q!: string;
}
