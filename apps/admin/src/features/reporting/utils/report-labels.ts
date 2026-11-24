/**
 * @file apps/admin/src/features/reporting/utils/report-labels.ts
 * @feature reporting
 * @dependencies shared-types
 *
 * Plain words for payment methods and booking states on the Reports page (display only).
 */

import type { PaymentMethodSlice, StaffReservation } from '@resort-booking/shared-types';

/** The four states an owner filters bookings by. */
export type BookingStatusKey = 'confirmed' | 'awaiting_payment' | 'cancelled' | 'expired';

export const BOOKING_STATUS_OPTIONS: { value: BookingStatusKey; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

/**
 * "Card / wallets", "Bank transfer", or "Not recorded".
 */
export function paymentMethodLabel(method: PaymentMethodSlice['paymentMethod'] | null): string {
  if (method === 'card') {
    return 'Card / wallets';
  }
  if (method === 'bank_transfer') {
    return 'Bank transfer';
  }
  return 'Not recorded';
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
