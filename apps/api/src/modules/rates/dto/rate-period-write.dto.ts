/**
 * @file apps/api/src/modules/rates/dto/rate-period-write.dto.ts
 * @feature rates
 * @dependencies class-validator
 */

import type { BulkRatePeriodRequest, RatePeriodWrite } from '@resort-booking/shared-types';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class RatePeriodWriteDto implements RatePeriodWrite {
  @IsString()
  @MaxLength(80)
  public label!: string;

  @Matches(ISO_DATE)
  public startDate!: string;

  @Matches(ISO_DATE)
  public endDate!: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  public nightlyRateCents!: number;
}

export class BulkRatePeriodDto extends RatePeriodWriteDto implements BulkRatePeriodRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @Matches(UUID_LIKE, { each: true })
  public houseIds!: string[];

  @IsBoolean()
  public confirmed!: boolean;
}
