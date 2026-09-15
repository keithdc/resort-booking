/**
 * @file apps/api/src/modules/identity/dto/update-organization.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @IsString()
  public legalName!: string;

  @IsString()
  public legalAddress!: string;

  @IsString()
  public vatNumber!: string;

  @IsString()
  public iban!: string;

  @IsString()
  public bic!: string;

  @IsString()
  public bankAccountName!: string;

  @IsEmail()
  public contactEmail!: string;

  @IsString()
  public contactPhone!: string;

  @IsString()
  public ownerName!: string;

  @IsEmail()
  public bookingEmail!: string;

  @IsEmail()
  public guestReplyEmail!: string;
}
