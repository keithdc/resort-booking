/**
 * @file apps/api/src/modules/identity/dto/update-organization.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import { IsEmail, IsPhoneNumber, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

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

  // Optional: an empty string is allowed, anything else must be a real international number.
  @ValidateIf((dto: UpdateOrganizationDto): boolean => dto.contactPhone !== '')
  @IsPhoneNumber(undefined, { message: 'contactPhone must be a valid international phone number, like +33612345678' })
  public contactPhone!: string;

  @IsString()
  public ownerName!: string;

  @IsEmail()
  public bookingEmail!: string;

  @IsEmail()
  public guestReplyEmail!: string;
}
