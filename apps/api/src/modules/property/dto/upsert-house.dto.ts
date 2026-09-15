/**
 * @file apps/api/src/modules/property/dto/upsert-house.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class HouseAmenityWriteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  public name!: string;

  @IsString()
  @MaxLength(2000)
  public details!: string;
}

export class HousePhotoWriteDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  public url!: string;

  @IsString()
  @MaxLength(160)
  public altText!: string;
}

export class UpsertHouseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  public slug!: string;

  @IsString()
  @MinLength(8)
  public description!: string;

  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(1)
  public capacity!: number;

  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(0)
  public nightlyRateCents!: number;

  @IsString()
  @MinLength(3)
  public currencyCode!: string;

  @Type((): BooleanConstructor => Boolean)
  @IsBoolean()
  public published!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type((): typeof HouseAmenityWriteDto => HouseAmenityWriteDto)
  public amenities!: HouseAmenityWriteDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type((): typeof HousePhotoWriteDto => HousePhotoWriteDto)
  public photos!: HousePhotoWriteDto[];
}
