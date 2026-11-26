/**
 * @file apps/api/src/modules/identity/dto/update-staff-profile.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

export class UpdateStaffProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.name)
  public fullName!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  public email!: string;
}
