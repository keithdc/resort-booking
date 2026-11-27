/**
 * @file apps/admin/src/shared/utils/booking-source.ts
 * @shared Where a booking came from: names, groups and what each means for payment
 * @dependencies shared-types
 */

import type { BookingSource } from '@resort-booking/shared-types';

/** Every source, in the order the pickers and the report list them. */
export const BOOKING_SOURCES: readonly BookingSource[] = ['website', 'airbnb', 'booking_com', 'other_site', 'phone_email', 'walk_in'];

const LABELS: Record<BookingSource, string> = {
  website: 'Our website',
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  other_site: 'Another website',
  phone_email: 'Phone or email',
  walk_in: 'Walk-in',
};

/** The words staff see for a source. */
export function bookingSourceLabel(source: BookingSource): string {
  return LABELS[source];
}

/** True for Airbnb, Booking.com and another site: that site collected the money, so refunds are handled there. */
export function isChannelSource(source: BookingSource): boolean {
  return source === 'airbnb' || source === 'booking_com' || source === 'other_site';
}

/** The sources staff can pick when they add a booking by hand (the guest checkout is always "Our website"). */
export const PICKABLE_SOURCES: readonly BookingSource[] = BOOKING_SOURCES;

/**
 * The sources an admin may correct a booking to: the same group only (own bookings among themselves, channel bookings
 * among themselves), because moving a booking across the groups would make its payment record wrong.
 */
export function correctableSources(current: BookingSource): readonly BookingSource[] {
  return BOOKING_SOURCES.filter((source): boolean => isChannelSource(source) === isChannelSource(current) && source !== current);
}
