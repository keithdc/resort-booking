/**
 * @file apps/api/src/modules/identity/dto/staff-login.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import { IsEmail, IsString, MinLength } from 'class-validator';

export class StaffLoginDto {
  @IsEmail()
  public email!: string;

  @IsString()
  @MinLength(1)
  public password!: string;
}
