/**
 * @file apps/api/src/modules/identity/dto/update-staff-profile.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import { IsEmail, IsString, MinLength } from 'class-validator';

export class UpdateStaffProfileDto {
  @IsString()
  @MinLength(2)
  public fullName!: string;

  @IsEmail()
  public email!: string;
}
