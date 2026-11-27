/**
 * @file apps/admin/src/features/reporting/utils/report-labels.ts
 * @feature reporting
 * @dependencies shared-types
 *
 * Plain words for payment methods and booking states on the Reports page (display only).
 */

import type { PaymentMethodSlice, StaffReservation } from '@resort-booking/shared-types';

/** The four states a booking or hold is in. */
export type BookingStatusKey = 'confirmed' | 'awaiting_payment' | 'cancelled' | 'expired';

/** What an owner filters bookings by: a state, or the pay-at-hotel bookings nobody has marked paid yet. */
export type BookingFilter = BookingStatusKey | 'unpaid_at_hotel';

export const BOOKING_STATUS_OPTIONS: { value: BookingStatusKey; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

/** The filter chips, in order: the four states, then the money still to collect at the hotel. */
export const BOOKING_FILTER_OPTIONS: { value: BookingFilter; label: string }[] = [
  ...BOOKING_STATUS_OPTIONS,
  { value: 'unpaid_at_hotel', label: 'Unpaid at hotel' },
];

/** A confirmed pay-at-hotel booking that nobody has marked paid yet. */
export function isUnpaidAtHotel(booking: Pick<StaffReservation, 'status' | 'paymentStatus'>): boolean {
  return booking.status === 'confirmed' && booking.paymentStatus === 'pending';
}

/**
 * How a booking stands on payment, for the CSV: "Pending" while a pay-at-hotel booking is unpaid, "Awaiting payment"
 * for a live hold, "Paid" for a confirmed booking, and nothing for a hold that ended or a cancelled booking.
 */
export function bookingPaymentStatusLabel(booking: Pick<StaffReservation, 'kind' | 'status' | 'paymentStatus'>): string {
  if (booking.kind === 'hold') {
    return booking.status === 'active' ? 'Awaiting payment' : '';
  }
  if (booking.status === 'cancelled') {
    return '';
  }
  return booking.paymentStatus === 'pending' ? 'Pending' : 'Paid';
}

/**
 * Why an unpaid booking needs money chased soon: "Check-in passed" (the guest came, nobody ticked it paid), "Arrives
 * today" or "Arrives in N days" within a week, otherwise nothing. `today` is the report's own date (property time).
 */
export function unpaidArrivalHint(checkIn: string, today: string): string | null {
  const days = Math.round((Date.parse(`${checkIn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days)) {
    return null;
  }
  if (days < 0) {
    return 'Check-in passed';
  }
  if (days === 0) {
    return 'Arrives today';
  }
  return days <= 7 ? `Arrives in ${String(days)} ${days === 1 ? 'day' : 'days'}` : null;
}

/**
 * "Card / wallets", "Bank transfer", "Pay at hotel", or "Not recorded".
 */
export function paymentMethodLabel(method: PaymentMethodSlice['paymentMethod'] | null): string {
  if (method === 'card') {
    return 'Card / wallets';
  }
  if (method === 'bank_transfer') {
    return 'Bank transfer';
  }
  if (method === 'pay_at_hotel') {
    return 'Pay at hotel';
  }
  if (method === 'paid_by_channel') {
    return 'Paid on another site';
  }
  return 'Not recorded';
}

/**
 * The payment of one booking for a list or export: the method, and "· Pending" while a pay-at-hotel booking is unpaid.
 */
export function bookingPaymentLabel(booking: Pick<StaffReservation, 'paymentMethod' | 'paymentStatus'>): string {
  const method = paymentMethodLabel(booking.paymentMethod);
  return booking.paymentStatus === 'pending' ? `${method} · Pending` : method;
}

/**
 * Which of the four states a booking or hold is in. A released hold counts as cancelled.
 */
export function bookingStatusKey(stay: Pick<StaffReservation, 'kind' | 'status'>): BookingStatusKey {
  if (stay.status === 'confirmed') {
    return 'confirmed';
  }
  if (stay.status === 'active') {
    return 'awaiting_payment';
  }
  if (stay.status === 'expired') {
    return 'expired';
  }
  return 'cancelled';
}

/**
 * The status in words, with a note when the booking replaced another after a date change.
 */
export function bookingStatusLabel(stay: Pick<StaffReservation, 'kind' | 'status' | 'arrivalStatus'>): string {
  const key = bookingStatusKey(stay);
  if (key === 'confirmed') {
    if (stay.arrivalStatus === 'checked_in') {
      return 'Staying now';
    }
    if (stay.arrivalStatus === 'checked_out') {
      return 'Checked out';
    }
    return 'Confirmed';
  }
  return BOOKING_STATUS_OPTIONS.find((option): boolean => option.value === key)?.label ?? 'Cancelled';
}

/**
 * Nights of a booking, from its two dates.
 */
export function bookingNights(stay: Pick<StaffReservation, 'checkIn' | 'checkOut'>): number {
  const ms = Date.parse(`${stay.checkOut}T00:00:00Z`) - Date.parse(`${stay.checkIn}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}
