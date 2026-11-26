/**
 * @file apps/admin/src/features/reservations/utils/new-booking.ts
 * @feature reservations
 * @dependencies shared-types, dates — rules for the "New booking" form (the API makes the final call)
 */

import type { HouseSummary } from '@resort-booking/shared-types';
import { addDaysIso, clampNights } from './dates';

/** How staff can take payment for a booking they make. Only pay at hotel is open; a card payment link is the next step. */
export interface NewBookingPaymentOption {
  value: 'pay_at_hotel' | 'card_link';
  label: string;
  help: string;
  enabled: boolean;
}

export const NEW_BOOKING_PAYMENT_OPTIONS: readonly NewBookingPaymentOption[] = [
  {
    value: 'pay_at_hotel',
    label: 'Pay at hotel',
    help: 'Confirmed now. Payment stays Pending until you mark it as paid.',
    enabled: true,
  },
  {
    value: 'card_link',
    label: 'Credit card',
    help: 'Payment link: coming soon',
    enabled: false,
  },
];

/** Longest stay the form offers (the API allows the same). */
export const NEW_BOOKING_MAX_NIGHTS = 60;

/** The booker's note is at most this long (the API refuses more). */
export const NEW_BOOKING_MAX_NOTE = 2000;

export interface NewBookingDraft {
  houseId: string;
  checkIn: string;
  nights: string;
  guests: string;
}

export interface NewBookingStay {
  houseId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

/** A whole number inside [min, max], or null for anything else (text, decimals, empty). */
export function wholeNumberInRange(text: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) {
    return null;
  }
  const value = Number.parseInt(text, 10);
  return value >= min && value <= max ? value : null;
}

/**
 * The stay the form describes, or null while something is missing or out of range (no stay chosen, a date in the
 * past, nights or guests not a number in range, more guests than the stay sleeps). Only a complete stay is priced.
 */
export function stayFromDraft(draft: NewBookingDraft, house: Pick<HouseSummary, 'id' | 'capacity'> | null, todayIso: string): NewBookingStay | null {
  if (house === null || draft.houseId !== house.id || !/^\d{4}-\d{2}-\d{2}$/.test(draft.checkIn) || draft.checkIn < todayIso) {
    return null;
  }
  const nights = wholeNumberInRange(draft.nights, 1, NEW_BOOKING_MAX_NIGHTS);
  const guests = wholeNumberInRange(draft.guests, 1, house.capacity);
  if (nights === null || guests === null) {
    return null;
  }
  return { houseId: house.id, checkIn: draft.checkIn, checkOut: addDaysIso(draft.checkIn, clampNights(nights)), guestCount: guests };
}

/** The sentence under the stay: what the form is about to book, or what is still missing. */
export function stayProblem(draft: NewBookingDraft, house: Pick<HouseSummary, 'id' | 'capacity' | 'name'> | null, todayIso: string): string | null {
  if (house === null) {
    return 'Choose a property and a stay.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.checkIn)) {
    return 'Choose the check-in date.';
  }
  if (draft.checkIn < todayIso) {
    return 'Check-in cannot be in the past.';
  }
  if (wholeNumberInRange(draft.nights, 1, NEW_BOOKING_MAX_NIGHTS) === null) {
    return `Nights must be a whole number from 1 to ${String(NEW_BOOKING_MAX_NIGHTS)}.`;
  }
  if (wholeNumberInRange(draft.guests, 1, house.capacity) === null) {
    return `${house.name} sleeps up to ${String(house.capacity)}: guests must be a whole number from 1 to ${String(house.capacity)}.`;
  }
  return null;
}
