/**
 * @file apps/api/src/modules/identity/dto/two-factor.dto.ts
 * @feature identity
 * @dependencies class-validator
 */

import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  TwoFactorConfirmRequest,
  TwoFactorEnableRequest,
  TwoFactorLoginRequest,
} from '@resort-booking/shared-types';
import { LIMITS } from '../../../shared/validation/limits';

/** Longest accepted code: a recovery code with a dash and a few stray spaces. */
const CODE_MAX = 32;

export class EnableTwoFactorDto implements TwoFactorEnableRequest {
  @IsString()
  @MinLength(6)
  @MaxLength(CODE_MAX)
  public code!: string;
}

export class ConfirmTwoFactorDto implements TwoFactorConfirmRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(LIMITS.password)
  public currentPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(CODE_MAX)
  public code!: string;
}

export class TwoFactorLoginDto implements TwoFactorLoginRequest {
  /** Exactly what /staff/login handed out: 32 random bytes as hex. */
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  public challengeToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(CODE_MAX)
  public code!: string;
}
