/**
 * @file apps/api/src/modules/reservations/dto/staff-range.query.dto.ts
 * @feature reservations
 * @dependencies class-validator
 */

import { IsOptional, Matches } from 'class-validator';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';

export class StaffRangeQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  public from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  public to!: string;

  @IsOptional()
  @Matches(UUID_LIKE)
  public propertyId?: string;
}
