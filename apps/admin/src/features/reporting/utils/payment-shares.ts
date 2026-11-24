/**
 * @file apps/admin/src/features/reporting/utils/payment-shares.ts
 * @feature reporting
 * @dependencies shared-types, report-labels
 */

import type { PaymentMethodSlice } from '@resort-booking/shared-types';
import { paymentMethodLabel } from './report-labels';

export interface PaymentShare {
  method: PaymentMethodSlice['paymentMethod'];
  label: string;
  bookings: number;
  revenueCents: number;
  /** Share of the money, to the nearest percent. */
  sharePercent: number;
}

/**
 * Each payment method with its share of the confirmed revenue, biggest first.
 */
export function buildPaymentShares(slices: readonly PaymentMethodSlice[]): PaymentShare[] {
  const total = slices.reduce((sum: number, slice: PaymentMethodSlice): number => sum + slice.revenueCents, 0);
  return [...slices]
    .sort((a: PaymentMethodSlice, b: PaymentMethodSlice): number => b.revenueCents - a.revenueCents)
    .map((slice: PaymentMethodSlice): PaymentShare => ({
      method: slice.paymentMethod,
      label: paymentMethodLabel(slice.paymentMethod),
      bookings: slice.reservationCount,
      revenueCents: slice.revenueCents,
      sharePercent: total === 0 ? 0 : Math.round((slice.revenueCents / total) * 100),
    }));
}
