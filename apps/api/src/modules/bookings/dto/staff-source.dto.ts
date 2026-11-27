/**
 * @file apps/api/src/modules/bookings/dto/staff-source.dto.ts
 * @feature bookings
 * @dependencies class-validator
 */

import type { BookingSource } from '@resort-booking/shared-types';
import { IsIn } from 'class-validator';

const SOURCES: readonly BookingSource[] = ['website', 'airbnb', 'booking_com', 'other_site', 'phone_email', 'walk_in'];

/** An admin's correction of where a booking came from. */
export class ChangeBookingSourceDto {
  @IsIn(SOURCES)
  public source!: BookingSource;
}
