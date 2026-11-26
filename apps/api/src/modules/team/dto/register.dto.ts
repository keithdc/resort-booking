/**
 * @file apps/api/src/modules/team/dto/register.dto.ts
 * @feature team
 * @dependencies class-validator
 */

import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.name)
  public organizationName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.name)
  public fullName!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  public email!: string;

  /** The policy (length, capital, number, common passwords, not built from the email) is checked by the service. */
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.password)
  public password!: string;
}
