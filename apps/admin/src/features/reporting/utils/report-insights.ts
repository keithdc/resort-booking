/**
 * @file apps/admin/src/features/reporting/utils/report-insights.ts
 * @feature reporting
 * @dependencies shared-types, report-compare
 *
 * Up to three plain sentences about the period, built only from facts in the report. When the data
 * does not support a sentence (nothing to compare, one stay only, too few payments) it is left out
 * instead of guessed.
 */

import type { PaymentMethodSlice, StaffReport } from '@resort-booking/shared-types';
import { compareAmounts } from './report-compare';

type InsightInput = Pick<
  StaffReport,
  'netRevenueCents' | 'previous' | 'properties' | 'paymentMethods' | 'occupiedNights' | 'availableNights' | 'occupancyPercent'
>;

/** Fewer confirmed bookings than this is too little to say how guests usually pay. */
const MIN_BOOKINGS_FOR_PAYMENT_INSIGHT = 3;

function revenueChange(report: InsightInput): string | null {
  const change = compareAmounts(report.netRevenueCents, report.previous.netRevenueCents);
  if (change.direction === 'none') {
    return null;
  }
  if (change.direction === 'same') {
    return 'Revenue is about the same as the previous period.';
  }
  return `Revenue is ${change.long.replace(' than the previous period.', '')} than the previous period.`;
}

function topStay(report: InsightInput): string | null {
  const stays = report.properties.flatMap((property) => property.houses);
  const total = stays.reduce((sum: number, stay): number => sum + stay.revenueCents, 0);
  if (stays.length < 2 || total <= 0) {
    return null;
  }
  const best = stays.reduce((top, stay) => (stay.revenueCents > top.revenueCents ? stay : top));
  const share = Math.round((best.revenueCents / total) * 100);
  return `${best.houseName} earned ${share}% of revenue.`;
}

function paymentHabit(report: InsightInput): string | null {
  const total = report.paymentMethods.reduce((sum: number, slice: PaymentMethodSlice): number => sum + slice.reservationCount, 0);
  if (total < MIN_BOOKINGS_FOR_PAYMENT_INSIGHT) {
    return null;
  }
  const top = report.paymentMethods.reduce((best: PaymentMethodSlice, slice: PaymentMethodSlice): PaymentMethodSlice =>
    slice.reservationCount > best.reservationCount ? slice : best,
  );
  const share = Math.round((top.reservationCount / total) * 100);
  if (top.paymentMethod === 'unknown' || share <= 50) {
    return null;
  }
  const how = top.paymentMethod === 'card' ? 'by card' : 'by bank transfer';
  return `Most guests pay ${how} (${share}%).`;
}

function occupancyFact(report: InsightInput): string | null {
  if (report.availableNights === 0) {
    return null;
  }
  return `${report.occupiedNights} of ${report.availableNights} nights were booked (${report.occupancyPercent}% occupancy).`;
}

/**
 * Up to three true sentences, most useful first.
 */
export function buildInsights(report: InsightInput): string[] {
  return [revenueChange(report), topStay(report), paymentHabit(report), occupancyFact(report)]
    .filter((sentence): sentence is string => sentence !== null)
    .slice(0, 3);
}
