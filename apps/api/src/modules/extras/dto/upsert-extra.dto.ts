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
  Matches,
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
  @Matches(/^[A-Z]{3}$/, { message: 'currencyCode must be three capital letters, like EUR' })
  public currencyCode!: string;

  @IsBoolean()
  public published!: boolean;
}
