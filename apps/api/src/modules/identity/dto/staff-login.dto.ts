/**
 * @file apps/api/src/modules/identity/dto/staff-login.dto.ts
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

export class StaffLoginDto {
  @IsEmail()
  @MaxLength(LIMITS.email)
  public email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.password)
  public password!: string;
}
