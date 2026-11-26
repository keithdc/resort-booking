/**
 * @file apps/api/src/modules/reservations/dto/save-booking-config.dto.ts
 * @feature reservations
 * @dependencies class-validator
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { RebookFeeType } from '@resort-booking/shared-types';
import { LIMITS } from '../../../shared/validation/limits';

export class CancellationTierWriteDto {
  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(0)
  @Max(LIMITS.maxDaysBefore)
  public minDaysBeforeCheckIn!: number;

  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  public refundPercent!: number;
}

export class SaveBookingConfigDto {
  @Type((): BooleanConstructor => Boolean)
  @IsBoolean()
  public rebookable!: boolean;

  @IsIn(['none', 'fixed', 'percent'])
  public rebookFeeType!: RebookFeeType;

  @Type((): NumberConstructor => Number)
  @IsNumber()
  @Min(0)
  @Max(LIMITS.maxCents)
  public rebookFeeValue!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.tiers)
  @ValidateNested({ each: true })
  @Type((): typeof CancellationTierWriteDto => CancellationTierWriteDto)
  public tiers!: CancellationTierWriteDto[];
}
