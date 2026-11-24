/**
 * @file apps/web/src/features/bookings/services/bookings-api.ts
 * @feature bookings
 * @dependencies api-client
 */

import type {
  GuestBooking,
  GuestBookingLookupRequest,
  HouseAvailability,
  RebookQuote,
  RebookRequest,
  RebookResult,
} from '@resort-booking/shared-types';
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

/**
 * The dates that are taken for this booking's stay, not counting the booking itself, so moving a
 * booking by a day is allowed. Same reference-and-email proof as a lookup.
 */
export function fetchRebookAvailability(request: GuestBookingLookupRequest): Promise<HouseAvailability> {
  return getApiOk<HouseAvailability>('/bookings/rebook/availability', { method: 'POST', body: JSON.stringify(request) });
}

/**
 * What changing to the new dates would cost, or why it cannot be done. Changes nothing.
 */
export function quoteRebook(request: RebookRequest): Promise<RebookQuote> {
  return getApiOk<RebookQuote>('/bookings/rebook/quote', { method: 'POST', body: JSON.stringify(request) });
}

/**
 * Changes the dates now when nothing more is owed, or opens the payment for the balance first.
 */
export function rebookBooking(request: RebookRequest): Promise<RebookResult> {
  return getApiOk<RebookResult>('/bookings/rebook', { method: 'POST', body: JSON.stringify(request) });
}
