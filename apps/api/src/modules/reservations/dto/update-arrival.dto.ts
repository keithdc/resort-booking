/**
 * @file apps/api/src/modules/reservations/dto/update-arrival.dto.ts
 * @feature reservations
 * @dependencies class-validator
 */

import { IsIn } from 'class-validator';
import type { ArrivalStatus } from '@resort-booking/shared-types';

export class UpdateArrivalDto {
  @IsIn(['expected', 'checked_in', 'checked_out'])
  public arrivalStatus!: ArrivalStatus;
}
