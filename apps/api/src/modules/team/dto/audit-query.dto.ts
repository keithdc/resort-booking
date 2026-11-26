/**
 * @file apps/api/src/modules/team/dto/audit-query.dto.ts
 * @feature team
 * @dependencies class-validator
 */

import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { QueryNumber } from '../../../shared/validation/query-number';

export class AuditQueryDto {
  /** e.g. "team." or "refund.": lower-case letters, dots and underscores only (checked again by the service). */
  @IsOptional()
  @Matches(/^[a-z_.]{1,40}$/)
  public action?: string;

  /** Only what this team member did (their staff user id, as listed on the Team page). */
  @IsOptional()
  @IsUUID()
  public member?: string;

  /** ISO date or date-time, inclusive. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/)
  public from?: string;

  /** ISO date or date-time, exclusive. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/)
  public to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  public cursor?: string;

  @IsOptional()
  @QueryNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number;
}
