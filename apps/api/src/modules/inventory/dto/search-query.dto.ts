/**
 * @file apps/api/src/modules/inventory/dto/search-query.dto.ts
 * @feature inventory
 * @dependencies class-validator
 */

import { QueryNumber } from '../../../shared/validation/query-number';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

export class SearchQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  public checkIn!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  public checkOut!: string;

  @QueryNumber()
  @IsInt()
  @Min(1)
  @Max(50)
  public guestCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.slug)
  public propertySlug?: string;
}
