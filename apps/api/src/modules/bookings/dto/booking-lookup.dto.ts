/**
 * @file apps/api/src/modules/bookings/dto/booking-lookup.dto.ts
 * @feature bookings
 * @dependencies class-validator
 */

import type { GuestBookingLookupRequest } from '@resort-booking/shared-types';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class BookingLookupDto implements GuestBookingLookupRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  public reference!: string;

  @IsEmail()
  @MaxLength(254)
  public email!: string;
}
