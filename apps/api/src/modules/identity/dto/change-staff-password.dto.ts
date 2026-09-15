/**
 * @file apps/api/src/modules/identity/dto/change-staff-password.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import { IsString, MinLength } from 'class-validator';

export class ChangeStaffPasswordDto {
  @IsString()
  @MinLength(1)
  public currentPassword!: string;

  @IsString()
  @MinLength(8)
  public newPassword!: string;
}
