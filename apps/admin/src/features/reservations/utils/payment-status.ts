/**
 * @file apps/admin/src/features/reservations/utils/payment-status.ts
 * @feature reservations
 * @dependencies shared-types — words and rules for "paid" and "pay at hotel" (display only)
 */

import type { StaffPaymentMethod, StaffReservation } from '@resort-booking/shared-types';

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
  return 'Not recorded';
}

/** Staff can tick a booking as paid only while it is a confirmed, pending pay-at-hotel booking. */
export function canMarkPaid(stay: Pick<StaffReservation, 'kind' | 'status' | 'paymentStatus' | 'paymentMethod'>): boolean {
  return stay.kind === 'reservation' && stay.status === 'confirmed' && stay.paymentStatus === 'pending' && stay.paymentMethod === 'pay_at_hotel';
}
