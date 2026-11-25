/**
 * @file apps/api/src/modules/discounts/dto/discount-write.dto.ts
 * @feature discounts
 * @dependencies class-validator
 */

import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { KeepRawValue } from '../../../shared/validation/keep-raw-value';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';

/**
 * Shape-checks the request. `effect` and `conditions` are objects here and are parsed into typed
 * unions by the service (unknown fields are dropped there), so a malformed one is a 400.
 */
export class DiscountWriteDto {
  @IsString()
  @MaxLength(80)
  public label!: string;

  @IsObject()
  public effect!: Record<string, unknown>;

  @IsArray()
  public conditions!: unknown[];

  @IsBoolean()
  public alwaysOn!: boolean;

  @ValidateIf((dto: DiscountWriteDto): boolean => dto.houseIds !== null)
  @IsArray()
  @Matches(UUID_LIKE, { each: true })
  public houseIds!: string[] | null;

  @IsBoolean()
  public combinable!: boolean;

  /** No longer set by the admin (automatic discounts never stack; a coupon follows them). Optional, default 100. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  public priority?: number;

  @IsBoolean()
  public active!: boolean;

  @ValidateIf((dto: DiscountWriteDto): boolean => dto.maxRedemptions !== null)
  @IsInt()
  @Min(1)
  public maxRedemptions!: number | null;

  /** Advertise on the guest site. Optional so older clients keep working (defaults to false). */
  @IsOptional()
  @KeepRawValue()
  @IsBoolean()
  public promoted?: boolean;
}
