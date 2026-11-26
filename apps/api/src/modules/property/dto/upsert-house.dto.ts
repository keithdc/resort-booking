/**
 * @file apps/api/src/modules/property/dto/upsert-house.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

export class HouseAmenityWriteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.name)
  public name!: string;

  @IsString()
  @MaxLength(LIMITS.note)
  public details!: string;
}

export class HousePhotoWriteDto {
  // https only: a javascript:, data: or file: address must never be stored and later rendered.
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(LIMITS.url)
  public url!: string;

  @IsString()
  @MaxLength(LIMITS.shortText)
  public altText!: string;
}

export class UpsertHouseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(LIMITS.slug)
  public slug!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(LIMITS.description)
  public description!: string;

  @IsInt()
  @Min(1)
  @Max(LIMITS.capacity)
  public capacity!: number;

  @IsInt()
  @Min(0)
  @Max(LIMITS.maxCents)
  public nightlyRateCents!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currencyCode must be three capital letters, like EUR' })
  public currencyCode!: string;

  @IsBoolean()
  public published!: boolean;

  @IsArray()
  @ArrayMaxSize(LIMITS.amenities)
  @ValidateNested({ each: true })
  @Type((): typeof HouseAmenityWriteDto => HouseAmenityWriteDto)
  public amenities!: HouseAmenityWriteDto[];

  @IsArray()
  @ArrayMaxSize(LIMITS.photos)
  @ValidateNested({ each: true })
  @Type((): typeof HousePhotoWriteDto => HousePhotoWriteDto)
  public photos!: HousePhotoWriteDto[];
}
