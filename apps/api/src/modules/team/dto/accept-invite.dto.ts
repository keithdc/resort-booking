/**
 * @file apps/api/src/modules/team/dto/accept-invite.dto.ts
 * @feature team
 * @dependencies class-validator
 */

import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

export class AcceptInviteDto {
  /** 64 hex characters, as issued. Anything else cannot be a token. */
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  public token!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.password)
  public password!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(LIMITS.name)
  public fullName?: string;
}
