/**
 * @file apps/api/src/modules/team/dto/reset-access.dto.ts
 * @feature team
 * @dependencies class-validator
 */

import { IsBoolean, IsOptional } from 'class-validator';
import { KeepRawValue } from '../../../shared/validation/keep-raw-value';

export class ResetAccessDto {
  /** Also email the one-time link to the member. Omitted or false: only the link is returned. */
  @IsOptional()
  @KeepRawValue()
  @IsBoolean()
  public sendEmail?: boolean;
}
