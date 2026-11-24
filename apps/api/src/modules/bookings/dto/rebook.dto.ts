/**
 * @file apps/api/src/modules/bookings/dto/rebook.dto.ts
 * @feature bookings
 * @dependencies class-validator
 */

import type { RebookRequest } from '@resort-booking/shared-types';
import { Matches } from 'class-validator';
import { BookingLookupDto } from './booking-lookup.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The booking (reference + email) and the dates the guest wants instead. The API checks the dates
 * are real, in order, not in the past, and free; this only checks the shape.
 */
export class RebookDto extends BookingLookupDto implements RebookRequest {
  @Matches(ISO_DATE, { message: 'newCheckIn must be a date like 2027-07-10' })
  public newCheckIn!: string;

  @Matches(ISO_DATE, { message: 'newCheckOut must be a date like 2027-07-12' })
  public newCheckOut!: string;
}
