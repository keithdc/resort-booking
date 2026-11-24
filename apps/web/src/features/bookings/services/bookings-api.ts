/**
 * @file apps/web/src/features/bookings/services/bookings-api.ts
 * @feature bookings
 * @dependencies api-client
 */

import type { GuestBooking, GuestBookingLookupRequest } from '@resort-booking/shared-types';
import { getApiOk } from '@/shared/services/api-client';

/**
 * Finds a booking from the reference and email the guest booked with. The API answers the same
 * "not found" whichever of the two was wrong.
 */
export function lookupBooking(request: GuestBookingLookupRequest): Promise<GuestBooking> {
  return getApiOk<GuestBooking>('/bookings/lookup', { method: 'POST', body: JSON.stringify(request) });
}

/**
 * Cancels the booking and refunds per the policy saved when it was booked. Safe to repeat: a second
 * call returns the same cancelled booking without a second refund.
 */
export function cancelBooking(request: GuestBookingLookupRequest): Promise<GuestBooking> {
  return getApiOk<GuestBooking>('/bookings/cancel', { method: 'POST', body: JSON.stringify(request) });
}
