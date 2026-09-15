/**
 * @file apps/api/src/modules/extras/dto/upsert-extra.dto.ts
 * @feature extras
 * @dependencies class-validator
 */

import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { ExtraServiceKind } from '@resort-booking/shared-types';

export class UpsertExtraDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @IsString()
  public description!: string;

  @IsIn(['instant', 'on_request'])
  public kind!: ExtraServiceKind;

  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(0)
  public priceCents!: number;

  @IsString()
  @MinLength(3)
  public currencyCode!: string;

  @Type((): BooleanConstructor => Boolean)
  @IsBoolean()
  public published!: boolean;
}
