/**
 * @file apps/api/src/modules/identity/dto/change-staff-password.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsAcceptablePassword } from '../../../shared/validation/is-acceptable-password';
import { LIMITS } from '../../../shared/validation/limits';

export class ChangeStaffPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.password)
  public currentPassword!: string;

  @IsString()
  @MaxLength(LIMITS.password)
  @IsAcceptablePassword()
  public newPassword!: string;
}
