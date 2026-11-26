/**
 * @file apps/api/src/modules/extras/dto/upsert-extra.dto.ts
 * @feature extras
 * @dependencies class-validator
 */

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { ExtraServiceKind } from '@resort-booking/shared-types';
import { LIMITS } from '../../../shared/validation/limits';

export class UpsertExtraDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @IsString()
  @MaxLength(LIMITS.note)
  public description!: string;

  @IsIn(['instant', 'on_request'])
  public kind!: ExtraServiceKind;

  @IsInt()
  @Min(0)
  @Max(LIMITS.maxCents)
  public priceCents!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(LIMITS.currencyCode)
  public currencyCode!: string;

  @IsBoolean()
  public published!: boolean;
}
