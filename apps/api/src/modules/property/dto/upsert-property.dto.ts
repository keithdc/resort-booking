/**
 * @file apps/api/src/modules/property/dto/upsert-property.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsPhoneNumber,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HousePhotoWriteDto } from './upsert-house.dto';

export class UpsertPropertyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  public slug!: string;

  @IsString()
  @MinLength(8)
  public description!: string;

  @IsString()
  @MinLength(3)
  public addressLine!: string;

  @IsString()
  @MinLength(2)
  public city!: string;

  @Matches(/^[A-Z]{2}$/)
  public countryCode!: string;

  @IsString()
  @MinLength(2)
  public postalCode!: string;

  @Type((): NumberConstructor => Number)
  @IsNumber()
  public latitude!: number;

  @Type((): NumberConstructor => Number)
  @IsNumber()
  public longitude!: number;

  @IsPhoneNumber(undefined, { message: 'phone must be a valid international phone number, like +33612345678' })
  public phone!: string;

  @IsEmail()
  public email!: string;

  @IsString()
  @MinLength(3)
  public timezone!: string;

  @Type((): BooleanConstructor => Boolean)
  @IsBoolean()
  public published!: boolean;

  @Type((): BooleanConstructor => Boolean)
  @IsBoolean()
  public customRequestsEnabled!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type((): typeof HousePhotoWriteDto => HousePhotoWriteDto)
  public photos!: HousePhotoWriteDto[];
}
