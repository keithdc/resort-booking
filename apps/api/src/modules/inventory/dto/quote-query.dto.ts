/**
 * @file apps/api/src/modules/inventory/dto/quote-query.dto.ts
 * @feature inventory
 * @dependencies class-validator
 */

import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { QueryNumber } from '../../../shared/validation/query-number';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';

export class QuoteQueryDto {
  @Matches(UUID_LIKE)
  public houseId!: string;

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
  @MaxLength(40)
  public promoCode?: string;
}
