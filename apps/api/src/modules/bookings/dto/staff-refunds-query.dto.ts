/**
 * @file apps/api/src/modules/bookings/dto/staff-refunds-query.dto.ts
 * @feature bookings
 * @dependencies class-validator
 */

import { IsIn, IsOptional, Matches } from 'class-validator';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';
import type { RefundQueueFilter } from '../staff-refunds.service';

export const REFUND_FILTERS: readonly RefundQueueFilter[] = ['needs_attention', 'pending', 'failed', 'succeeded', 'all'];

/** `?status=` and `?propertyId=` for the refunds queue. */
export class StaffRefundsQueryDto {
  @IsOptional()
  @IsIn(REFUND_FILTERS)
  public status?: RefundQueueFilter;

  @IsOptional()
  @Matches(UUID_LIKE, { message: 'propertyId must be an id' })
  public propertyId?: string;
}
