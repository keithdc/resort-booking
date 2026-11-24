/**
 * @file apps/admin/src/features/reporting/utils/glance-cards.ts
 * @feature reporting
 * @dependencies shared-types, report-compare, money
 *
 * The four headline cards of the report, as words: the number, one plain line under it, and how it
 * compares with the period before. Formatting only; every figure comes from the API.
 */

import type { StaffReport } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';
import { compareAmounts, comparePoints, type Change } from './report-compare';
import type { MetricKey } from './metric-definitions';

export interface GlanceCard {
  key: 'revenue' | 'bookings' | 'occupancy' | 'averageNightlyRate';
  metric: MetricKey;
  label: string;
  value: string;
  /** Small second line (e.g. gross and refunded for revenue), or null. */
  secondary: string | null;
  /** One plain line saying what the number is. */
  explanation: string;
  change: Change;
}

type GlanceInput = Pick<
  StaffReport,
  | 'currencyCode'
  | 'netRevenueCents'
  | 'grossRevenueCents'
  | 'refundedCents'
  | 'reservationCount'
  | 'occupancyPercent'
  | 'occupiedNights'
  | 'availableNights'
  | 'averageNightlyCents'
  | 'previous'
>;

/**
 * Exactly four cards: revenue, bookings, occupancy and average nightly rate.
 */
export function buildGlanceCards(report: GlanceInput): GlanceCard[] {
  const { previous, currencyCode } = report;
  const previousHadBookings = previous.reservationCount > 0;
  return [
    {
      key: 'revenue',
      metric: 'revenue',
      label: 'Revenue',
      value: formatCents(report.netRevenueCents, currencyCode),
      secondary: `Paid by guests ${formatCents(report.grossRevenueCents, currencyCode)} · Refunded ${formatCents(report.refundedCents, currencyCode)}`,
      explanation: 'Money you kept: what guests paid for nights in this period, minus refunds.',
      change: compareAmounts(report.netRevenueCents, previous.netRevenueCents),
    },
    {
      key: 'bookings',
      metric: 'bookings',
      label: 'Bookings',
      value: String(report.reservationCount),
      secondary: null,
      explanation: 'Confirmed, paid bookings with at least one night in this period.',
      change: compareAmounts(report.reservationCount, previous.reservationCount),
    },
    {
      key: 'occupancy',
      metric: 'occupancy',
      label: 'Occupancy',
      value: `${report.occupancyPercent}%`,
      secondary: null,
      explanation: `${report.occupiedNights} of ${report.availableNights} available nights were booked.`,
      change: comparePoints(report.occupancyPercent, previous.occupancyPercent, previousHadBookings),
    },
    {
      key: 'averageNightlyRate',
      metric: 'averageNightlyRate',
      label: 'Average nightly rate',
      value: formatCents(report.averageNightlyCents, currencyCode),
      secondary: null,
      explanation: 'What a booked night sold for on average, after discounts.',
      change: compareAmounts(report.averageNightlyCents, previous.averageNightlyCents),
    },
  ];
}
