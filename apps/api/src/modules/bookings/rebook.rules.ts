/**
 * @file apps/api/src/modules/bookings/rebook.rules.ts
 * @feature bookings
 * @dependencies shared-types, inventory.rules, bookings.rules
 */

import type { BookingPaymentStatus, RebookFeeType } from '@resort-booking/shared-types';
import { isPriceSnapshot, nightsBetween, type PriceSnapshot } from '../inventory/inventory.rules';
import { BOOKING_CANCELLED_MESSAGE, BOOKING_STARTED_MESSAGE, wholeDaysBetween } from './bookings.rules';

/** A guest looking at a booking that is to be paid at the property: dates cannot be moved online until it is paid. */
export const PAYMENT_PENDING_GUEST_MESSAGE =
  'This booking is paid at the property, so its dates cannot be changed online. Please contact the property.';
/** Staff: the price difference needs a paid booking to be worked out. */
export const PAYMENT_PENDING_STAFF_MESSAGE =
  'This booking has not been paid yet. Mark it as paid first, or cancel it and make a new booking.';
/** A priced extra is part of what was paid, and a date change prices the stay only: cancel and book again instead. */
export const PRICED_EXTRAS_GUEST_MESSAGE =
  'This booking includes paid extras, so its dates cannot be changed online. Please contact the property, or cancel and book again.';
export const PRICED_EXTRAS_STAFF_MESSAGE =
  'This booking includes paid extras, so its dates cannot be changed here yet. Cancel it and make a new booking instead.';
export const REBOOK_NOT_ALLOWED_MESSAGE = 'The dates of this booking cannot be changed. To change them, cancel and book again.';
export const NO_CHANGE_MESSAGE = 'Those are already the dates of this booking.';
export const DATES_TAKEN_MESSAGE = 'Those dates are not available for this stay. Please choose other dates.';

/**
 * Money for a message, e.g. "€30.00". Display only; amounts stay in whole cents everywhere else.
 */
export function formatMoney(cents: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currencyCode }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currencyCode}`;
  }
}

// --- Fee and balance ---

/**
 * The change fee, from the policy saved with the booking. Never negative, always whole cents.
 * none -> 0. fixed -> the euro amount in cents. percent -> that percent of what has been paid so far.
 */
export function rebookFeeCents(feeType: RebookFeeType, feeValue: number, paidCents: number): number {
  if (!Number.isFinite(feeValue) || feeValue <= 0 || feeType === 'none') {
    return 0;
  }
  if (feeType === 'fixed') {
    return Math.round(feeValue * 100);
  }
  const paid = Number.isInteger(paidCents) && paidCents > 0 ? paidCents : 0;
  return Math.round((paid * Math.min(100, feeValue)) / 100);
}

export interface RebookBalance {
  /** newTotal + fee - paid. Positive: the guest pays more. Negative: money comes back. */
  balanceCents: number;
  payCents: number;
  refundCents: number;
}

/**
 * What changes hands. Whatever the case, the booking afterwards holds exactly newTotal + fee.
 */
export function rebookBalance(newTotalCents: number, feeCents: number, paidCents: number): RebookBalance {
  const balanceCents = newTotalCents + feeCents - paidCents;
  return {
    balanceCents,
    payCents: Math.max(balanceCents, 0),
    refundCents: Math.max(-balanceCents, 0),
  };
}

// --- Who may change, and to what ---

export type RebookEligibility =
  | { allowed: true }
  | {
      allowed: false;
      code: 'BOOKING_CANCELLED' | 'REBOOK_NOT_ALLOWED' | 'BOOKING_ALREADY_STARTED' | 'PAYMENT_PENDING' | 'EXTRAS_ON_BOOKING';
      message: string;
    };

/**
 * May this booking's dates be changed online? The policy that counts is the one saved with the booking
 * (passed in as `rebookable`). Not when it is cancelled or its check-in date has already passed; the
 * check-in day itself still counts as not started, like cancelling.
 */
export function checkRebookAllowed(
  rebookable: boolean,
  bookingStatus: 'confirmed' | 'cancelled',
  checkInIso: string,
  todayIso: string,
  paymentStatus: BookingPaymentStatus = 'paid',
  audience: 'guest' | 'staff' = 'guest',
  hasPricedExtras = false,
): RebookEligibility {
  if (bookingStatus === 'cancelled') {
    return { allowed: false, code: 'BOOKING_CANCELLED', message: BOOKING_CANCELLED_MESSAGE };
  }
  if (paymentStatus === 'pending') {
    // Nothing has been paid, so "what the guest paid" is 0 and a date change would charge the whole new stay again.
    return {
      allowed: false,
      code: 'PAYMENT_PENDING',
      message: audience === 'staff' ? PAYMENT_PENDING_STAFF_MESSAGE : PAYMENT_PENDING_GUEST_MESSAGE,
    };
  }
  if (!rebookable) {
    return { allowed: false, code: 'REBOOK_NOT_ALLOWED', message: REBOOK_NOT_ALLOWED_MESSAGE };
  }
  if (hasPricedExtras) {
    return {
      allowed: false,
      code: 'EXTRAS_ON_BOOKING',
      message: audience === 'staff' ? PRICED_EXTRAS_STAFF_MESSAGE : PRICED_EXTRAS_GUEST_MESSAGE,
    };
  }
  const days = wholeDaysBetween(todayIso, checkInIso);
  if (Number.isNaN(days) || days < 0) {
    return { allowed: false, code: 'BOOKING_ALREADY_STARTED', message: BOOKING_STARTED_MESSAGE };
  }
  return { allowed: true };
}

export interface DateRangeInput {
  checkIn: string;
  checkOut: string;
}

/** `invalid`: not a real range of one or more nights. `past`: the new check-in is before today. `same`: no change. */
export type NewDatesCheck = 'ok' | 'invalid' | 'past' | 'same';

/**
 * Are these usable new dates? Checked in this order so the most useful message wins.
 */
export function checkNewDates(current: DateRangeInput, next: DateRangeInput, todayIso: string): NewDatesCheck {
  if (nightsBetween(next.checkIn, next.checkOut) === null) {
    return 'invalid';
  }
  if (next.checkIn < todayIso) {
    return 'past';
  }
  if (next.checkIn === current.checkIn && next.checkOut === current.checkOut) {
    return 'same';
  }
  return 'ok';
}

// --- The change a guest agreed to pay for ---

/** Kept with a balance payment until it settles, so the guest gets exactly what they were quoted. */
export interface RebookPayload {
  oldBookingId: string;
  newCheckIn: string;
  newCheckOut: string;
  newTotalCents: number;
  feeCents: number;
  /** The price lines the guest was quoted for the new dates. */
  priceSnapshot: PriceSnapshot;
}

/**
 * Reads a stored payload. Null for anything incomplete, so a damaged row can never apply a change.
 */
export function parseRebookPayload(raw: unknown): RebookPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record.oldBookingId !== 'string' ||
    typeof record.newCheckIn !== 'string' ||
    typeof record.newCheckOut !== 'string' ||
    typeof record.newTotalCents !== 'number' ||
    typeof record.feeCents !== 'number' ||
    !isPriceSnapshot(record.priceSnapshot)
  ) {
    return null;
  }
  return {
    oldBookingId: record.oldBookingId,
    newCheckIn: record.newCheckIn,
    newCheckOut: record.newCheckOut,
    newTotalCents: record.newTotalCents,
    feeCents: record.feeCents,
    priceSnapshot: record.priceSnapshot,
  };
}

// --- The price recorded on the new booking ---

/**
 * The price lines of a quote, as saved with a booking. The change fee rides along as an extra field
 * (the booking's total is the stay itself; the fee is on top and is part of what was paid).
 */
export function priceSnapshotOf(quote: {
  lines: PriceSnapshot['lines'];
  subtotalCents: number;
  discounts: PriceSnapshot['discounts'];
  discountCents: number;
  totalCents: number;
  currencyCode: string;
  promoCode: PriceSnapshot['promoCode'];
}): PriceSnapshot {
  return {
    lines: quote.lines,
    subtotalCents: quote.subtotalCents,
    discounts: quote.discounts,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    currencyCode: quote.currencyCode,
    promoCode: quote.promoCode,
  };
}

/**
 * The promo code a booking used, when it was applied, so a change can try it again on the new dates.
 * Null when none was used or the saved price cannot be read.
 */
export function appliedPromoCodeOf(rawPriceSnapshot: unknown): string | null {
  if (!isPriceSnapshot(rawPriceSnapshot)) {
    return null;
  }
  const promo = rawPriceSnapshot.promoCode;
  return promo !== null && promo.applied ? promo.code : null;
}
