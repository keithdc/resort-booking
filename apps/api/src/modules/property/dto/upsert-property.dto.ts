/**
 * @file apps/api/src/modules/property/dto/upsert-property.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsPhoneNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HousePhotoWriteDto } from './upsert-house.dto';
import { LIMITS } from '../../../shared/validation/limits';

export class UpsertPropertyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.name)
  public name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(LIMITS.slug)
  public slug!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(LIMITS.description)
  public description!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(LIMITS.address)
  public addressLine!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.shortText)
  public city!: string;

  @Matches(/^[A-Z]{2}$/)
  public countryCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.postalCode)
  public postalCode!: string;

  @Type((): NumberConstructor => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  public latitude!: number;

  @Type((): NumberConstructor => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  public longitude!: number;

  @IsPhoneNumber(undefined, { message: 'phone must be a valid international phone number, like +33612345678' })
  @MaxLength(LIMITS.phone)
  public phone!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  public email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(LIMITS.timezone)
  public timezone!: string;

  @Type((): BooleanConstructor => Boolean)
  @IsBoolean()
  public published!: boolean;

  @Type((): BooleanConstructor => Boolean)
  @IsBoolean()
  public customRequestsEnabled!: boolean;

  @IsArray()
  @ArrayMaxSize(LIMITS.photos)
  @ValidateNested({ each: true })
  @Type((): typeof HousePhotoWriteDto => HousePhotoWriteDto)
  public photos!: HousePhotoWriteDto[];
}
