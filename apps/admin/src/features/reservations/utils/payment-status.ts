/**
 * @file apps/admin/src/features/reservations/utils/payment-status.ts
 * @feature reservations
 * @dependencies shared-types — words and rules for "paid" and "pay at hotel" (display only)
 */

import type { BookingExtra, StaffPaymentMethod, StaffReservation } from '@resort-booking/shared-types';

type PaymentFields = Pick<StaffReservation, 'paymentMethod' | 'paymentStatus'>;

export interface PaymentChipStyle {
  label: string;
  tone: 'warning' | 'success';
}

/**
 * The chip for a booking's payment: "Pay at hotel · Pending" until a person marks it paid, "Paid at hotel" after.
 * Online bookings (card, bank transfer) are paid by the time they are bookings, so they get no chip unless
 * `showPaid` asks for a plain "Paid" (the booking card does).
 */
export function paymentChipStyle(stay: PaymentFields, showPaid = false): PaymentChipStyle | null {
  if (stay.paymentStatus === 'pending') {
    return { label: 'Pay at hotel · Pending', tone: 'warning' };
  }
  if (stay.paymentMethod === 'pay_at_hotel') {
    return { label: 'Paid at hotel', tone: 'success' };
  }
  if (stay.paymentMethod === 'paid_by_channel') {
    return showPaid ? { label: 'Paid on the other site', tone: 'success' } : null;
  }
  return showPaid ? { label: 'Paid', tone: 'success' } : null;
}

/** How the guest pays, in words. */
export function paymentMethodText(method: StaffPaymentMethod | null): string {
  if (method === 'bank_transfer') {
    return 'Bank transfer';
  }
  if (method === 'card') {
    return 'Card / Apple Pay / Google Pay';
  }
  if (method === 'pay_at_hotel') {
    return 'Pay at hotel';
  }
  if (method === 'paid_by_channel') {
    return 'Paid on the other website';
  }
  return 'Not recorded';
}

/** Staff can tick a booking as paid only while it is a confirmed, pending pay-at-hotel booking. */
export function canMarkPaid(stay: Pick<StaffReservation, 'kind' | 'status' | 'paymentStatus' | 'paymentMethod'>): boolean {
  return stay.kind === 'reservation' && stay.status === 'confirmed' && stay.paymentStatus === 'pending' && stay.paymentMethod === 'pay_at_hotel';
}

/** What someone without refund access is told on a pending booking (the API refuses the tick with code FORBIDDEN_ROLE). */
export const MARK_PAID_NEEDS_ACCESS_MESSAGE = 'Ask an admin, or an admin can give you refund access on the Team page, to mark this booking as paid.';

/**
 * One extra on a booking, in words: what was chosen, how many and what it adds. An instant extra shows its line (it is in
 * the booking total); a request says nothing is charged, and a declined one says so.
 */
export function bookingExtraText(extra: BookingExtra, money: (cents: number) => string): string {
  const what = `${extra.name} × ${String(extra.quantity)}`;
  if (extra.kind === 'instant') {
    return `${what} · ${extra.lineCents > 0 ? money(extra.lineCents) : 'Free'}`;
  }
  return `${what} · ${extra.status === 'declined' ? 'Declined' : 'On request: waiting for the property to confirm, nothing charged'}`;
}
