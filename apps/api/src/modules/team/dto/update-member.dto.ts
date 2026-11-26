/**
 * @file apps/api/src/modules/team/dto/update-member.dto.ts
 * @feature team
 * @dependencies class-validator
 */

import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { KeepRawValue } from '../../../shared/validation/keep-raw-value';
import { STAFF_ROLES, type StaffRole } from '../../../shared/roles/staff-role';

export class UpdateMemberDto {
  @IsOptional()
  @IsIn(STAFF_ROLES)
  public role?: StaffRole;

  @IsOptional()
  @KeepRawValue()
  @IsBoolean()
  public active?: boolean;

  /** Grant or remove "can handle refunds and money actions" (employees only; the service refuses it for an admin). */
  @IsOptional()
  @KeepRawValue()
  @IsBoolean()
  public canManageRefunds?: boolean;
}
