/**
 * @file apps/api/src/modules/reservations/report-summary.rules.ts
 * @feature reservations
 * @dependencies reservations.rules, shared/dates
 *
 * Pure rules for the owner report: the period right before the chosen one, the money a property kept
 * after refunds, the cancellation rate, and the headline numbers of a period. No database here.
 */

import type { CancellationReasonRow, PeriodSummary, StaffReservation } from '@resort-booking/shared-types';
import { addDaysIso } from '../../shared/dates/iso-date';
import { nightsBetween } from '../inventory/inventory.rules';
import { overlapNights } from './reservations.rules';

/** Nights, revenue and guests that confirmed bookings contribute to one period. */
export interface ConfirmedTotals {
  occupiedNights: number;
  revenueCents: number;
  guestCount: number;
  /** Confirmed pay-at-hotel bookings in the period that nobody has marked paid yet. */
  unpaidAtHotelCount: number;
  /** The part of `revenueCents` those bookings account for: booked, not collected. */
  unpaidAtHotelCents: number;
}

/** What the cancellation query returned for a period, already added up. */
export interface CancellationTotals {
  cancelledCount: number;
  paidCents: number;
  refundedCents: number;
}

/**
 * The equal-length window that ends where [from, to) starts. null when the range is not valid.
 */
export function previousRange(from: string, to: string): { from: string; to: string } | null {
  const span = nightsBetween(from, to);
  if (span === null) {
    return null;
  }
  return { from: addDaysIso(from, -span), to: from };
}

/**
 * What one night of a booking earns: its total over its nights, rounded to a cent.
 */
export function nightlyCents(stay: StaffReservation): number {
  const stayNights = nightsBetween(stay.checkIn, stay.checkOut) ?? 1;
  return Math.round(stay.totalCents / stayNights);
}

/**
 * Revenue of one booking inside [from, to): the rounded nightly price times the nights that fall in it.
 */
export function rangedRevenueCents(stay: StaffReservation, from: string, to: string): number {
  return nightlyCents(stay) * overlapNights(stay.checkIn, stay.checkOut, from, to);
}

/**
 * Nights, revenue and guest headcount of confirmed bookings inside [from, to). `revenueCents` is the booked value
 * (paid or not); the pay-at-hotel bookings still waiting for payment are counted apart, so a report can say how much
 * of it is still to collect.
 */
export function confirmedTotals(stays: readonly StaffReservation[], from: string, to: string): ConfirmedTotals {
  let occupiedNights = 0;
  let revenueCents = 0;
  let guestCount = 0;
  let unpaidAtHotelCount = 0;
  let unpaidAtHotelCents = 0;
  for (const stay of stays) {
    const ranged = rangedRevenueCents(stay, from, to);
    occupiedNights += overlapNights(stay.checkIn, stay.checkOut, from, to);
    revenueCents += ranged;
    guestCount += stay.guestCount;
    if (stay.paymentStatus === 'pending') {
      unpaidAtHotelCount += 1;
      unpaidAtHotelCents += ranged;
    }
  }
  return { occupiedNights, revenueCents, guestCount, unpaidAtHotelCount, unpaidAtHotelCents };
}

/**
 * Adds up the per-reason cancellation rows.
 */
export function cancellationTotals(rows: readonly CancellationReasonRow[]): CancellationTotals {
  return rows.reduce(
    (sum: CancellationTotals, row: CancellationReasonRow): CancellationTotals => ({
      cancelledCount: sum.cancelledCount + row.cancelledCount,
      paidCents: sum.paidCents + row.paidCents,
      refundedCents: sum.refundedCents + row.refundedCents,
    }),
    { cancelledCount: 0, paidCents: 0, refundedCents: 0 },
  );
}

/**
 * Share of bookings that were cancelled, to one decimal (cancelled / (confirmed + cancelled)).
 */
export function cancellationRatePercent(confirmedCount: number, cancelledCount: number): number {
  const total = confirmedCount + cancelledCount;
  return total === 0 ? 0 : Math.round((cancelledCount / total) * 1000) / 10;
}

/**
 * Share of the available stay-nights that were booked, to one decimal.
 */
export function occupancyPercent(occupiedNights: number, availableNights: number): number {
  return availableNights === 0 ? 0 : Math.round((occupiedNights / availableNights) * 1000) / 10;
}

/**
 * The headline numbers of one period. Gross is what guests PAID for bookings with nights in the period (confirmed
 * ones that are paid, plus cancelled ones that kept money); a pay-at-hotel booking nobody has marked paid is not in
 * it: it is shown apart as `unpaidAtHotelCents`, still to collect. Net takes the refunds off gross.
 */
export function buildPeriodSummary(input: {
  from: string;
  to: string;
  houseCount: number;
  reservationCount: number;
  totals: ConfirmedTotals;
  cancellations: CancellationTotals;
}): PeriodSummary {
  const { totals, cancellations } = input;
  const span = nightsBetween(input.from, input.to) ?? 0;
  const grossRevenueCents = totals.revenueCents - totals.unpaidAtHotelCents + cancellations.paidCents;
  return {
    from: input.from,
    to: input.to,
    reservationCount: input.reservationCount,
    occupiedNights: totals.occupiedNights,
    occupancyPercent: occupancyPercent(totals.occupiedNights, input.houseCount * span),
    averageNightlyCents: totals.occupiedNights === 0 ? 0 : Math.round(totals.revenueCents / totals.occupiedNights),
    grossRevenueCents,
    refundedCents: cancellations.refundedCents,
    netRevenueCents: grossRevenueCents - cancellations.refundedCents,
    cancelledCount: cancellations.cancelledCount,
    cancellationRatePercent: cancellationRatePercent(input.reservationCount, cancellations.cancelledCount),
    unpaidAtHotelCents: totals.unpaidAtHotelCents,
  };
}
