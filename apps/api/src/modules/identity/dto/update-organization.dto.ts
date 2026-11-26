/**
 * @file apps/api/src/modules/identity/dto/update-organization.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import {
  IsEmail,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

export class UpdateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @IsString()
  @MaxLength(LIMITS.shortText)
  public legalName!: string;

  @IsString()
  @MaxLength(LIMITS.address)
  public legalAddress!: string;

  @IsString()
  @MaxLength(LIMITS.vat)
  public vatNumber!: string;

  @IsString()
  // Letters, digits and spaces only (an IBAN is at most 34 characters); empty is allowed until it is filled in.
  @Matches(/^[A-Za-z0-9 ]*$/, { message: 'iban may contain only letters, numbers and spaces' })
  @MaxLength(LIMITS.iban + 8)
  public iban!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]*$/, { message: 'bic may contain only letters and numbers' })
  @MaxLength(LIMITS.bic)
  public bic!: string;

  @IsString()
  @MaxLength(LIMITS.name)
  public bankAccountName!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  public contactEmail!: string;

  // Optional: an empty string is allowed, anything else must be a real international number.
  @ValidateIf((dto: UpdateOrganizationDto): boolean => dto.contactPhone !== '')
  @IsPhoneNumber(undefined, { message: 'contactPhone must be a valid international phone number, like +33612345678' })
  @MaxLength(LIMITS.phone)
  public contactPhone!: string;

  @IsString()
  @MaxLength(LIMITS.name)
  public ownerName!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  public bookingEmail!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  public guestReplyEmail!: string;
}
