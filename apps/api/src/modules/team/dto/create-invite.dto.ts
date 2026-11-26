/**
 * @file apps/api/src/modules/team/dto/create-invite.dto.ts
 * @feature team
 * @dependencies class-validator
 */

import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';
import { KeepRawValue } from '../../../shared/validation/keep-raw-value';
import { STAFF_ROLES, type StaffRole } from '../../../shared/roles/staff-role';

export class CreateInviteDto {
  @IsEmail()
  @MaxLength(LIMITS.email)
  public email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.name)
  public fullName!: string;

  @IsIn(STAFF_ROLES)
  public role!: StaffRole;

  /** Also email the one-time link to the invited address. Omitted or false: only the link is returned. */
  @IsOptional()
  @KeepRawValue()
  @IsBoolean()
  public sendEmail?: boolean;
}
