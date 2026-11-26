/**
 * @file apps/web/src/shared/utils/cancellation-policy.ts
 * @shared Plain-language wording for the API's cancellation policy (display only)
 * @dependencies money
 */

import type { CancellationPolicy, CancellationPolicyTier } from '@resort-booking/shared-types';
import { formatDayMonthYear, isRealIsoDate, shiftIsoDate } from './iso-date-text';
import { formatCents } from './money';

/**
 * One sentence about changing dates: allowed or not, and the fee.
 */
export function describeRebooking(policy: Pick<CancellationPolicy, 'rebookable' | 'rebookFeeType' | 'rebookFeeValue'>, currencyCode: string): string {
  if (!policy.rebookable) {
    return 'Dates cannot be changed after booking. You can cancel (the refund above applies) and book again.';
  }
  const base = 'You can change the dates of your booking on the same stay, if it is free on the new dates';
  if (policy.rebookFeeType === 'fixed' && policy.rebookFeeValue > 0) {
    return `${base}, for a fee of ${formatCents(Math.round(policy.rebookFeeValue * 100), currencyCode)}.`;
  }
  if (policy.rebookFeeType === 'percent' && policy.rebookFeeValue > 0) {
    return `${base}, for a fee of ${trimNumber(policy.rebookFeeValue)}% of what you paid.`;
  }
  return `${base}, at no charge.`;
}

export type RefundTone = 'success' | 'warning' | 'error';

export interface RefundSegment {
  /** Stable key: the tier's minimum days. */
  key: string;
  /** The period in days, e.g. "3 to 6 days before". */
  period: string;
  /** Wording for the refund, e.g. "75% refund". */
  refund: string;
  /** The API's percentage, always shown as text next to the colour. */
  percent: number;
  tone: RefundTone;
  /** Concrete date window when a check-in date is known, otherwise null. */
  window: string | null;
}

/**
 * One line that sums up the ladder, e.g. "Full refund until 7 days before check-in". With a
 * check-in date (YYYY-MM-DD) the days become a date: "Full refund until 3 Dec 2026". Null when the
 * property has no ladder.
 */
export function describeRefundHeadline(tiers: readonly CancellationPolicyTier[], checkIn?: string): string | null {
  if (tiers.length === 0) {
    return null;
  }
  const paying = tiers.filter((tier): boolean => tier.refundPercent > 0);
  if (paying.length === 0) {
    return 'No refund when cancelling';
  }
  const known = checkIn !== undefined && isRealIsoDate(checkIn) ? checkIn : null;
  const untilText = (minDays: number): string => {
    const deadline = known === null ? null : shiftIsoDate(known, -minDays);
    return deadline === null ? `${plural(minDays, 'day')} before check-in` : formatDayMonthYear(deadline);
  };
  // The latest deadline that still gives everything back.
  const full = paying
    .filter((tier): boolean => tier.refundPercent >= 100 && tier.minDaysBeforeCheckIn > 0)
    .sort((a, b): number => a.minDaysBeforeCheckIn - b.minDaysBeforeCheckIn)[0];
  if (full !== undefined) {
    return `Full refund until ${untilText(full.minDaysBeforeCheckIn)}`;
  }
  const best = [...paying].sort(
    (a, b): number => b.refundPercent - a.refundPercent || a.minDaysBeforeCheckIn - b.minDaysBeforeCheckIn,
  )[0];
  if (best === undefined) {
    return null;
  }
  if (best.minDaysBeforeCheckIn > 0) {
    return `Refund of up to ${trimNumber(best.refundPercent)}% until ${untilText(best.minDaysBeforeCheckIn)}`;
  }
  const until = known === null ? 'check-in' : `check-in on ${formatDayMonthYear(known)}`;
  return `${refundText(best.refundPercent)} until ${until}`;
}

/**
 * The ladder as ordered segments, earliest cancellation first: "7 or more days before",
 * "3 to 6 days before", "Less than 1 day, or no-show". Gaps between tiers become ranges.
 * The percentages are the API's. Dates are filled in when a check-in date is known.
 */
export function buildRefundSegments(tiers: readonly CancellationPolicyTier[], checkIn?: string): RefundSegment[] {
  const ordered = [...tiers].sort((a, b): number => b.minDaysBeforeCheckIn - a.minDaysBeforeCheckIn);
  const smallestPositive = ordered
    .map((tier): number => tier.minDaysBeforeCheckIn)
    .filter((days): boolean => days > 0)
    .at(-1);
  const known = checkIn !== undefined && isRealIsoDate(checkIn) ? checkIn : null;
  return ordered.map((tier, index): RefundSegment => {
    const earlier = ordered[index - 1]?.minDaysBeforeCheckIn;
    return {
      key: String(tier.minDaysBeforeCheckIn),
      period: periodText(tier.minDaysBeforeCheckIn, earlier, smallestPositive),
      refund: refundText(tier.refundPercent),
      percent: tier.refundPercent,
      tone: toneFor(tier.refundPercent),
      window: known === null ? null : windowText(known, tier.minDaysBeforeCheckIn, earlier),
    };
  });
}

function toneFor(percent: number): RefundTone {
  if (percent >= 100) {
    return 'success';
  }
  return percent <= 0 ? 'error' : 'warning';
}

function periodText(minDays: number, earlierMin: number | undefined, smallestPositive: number | undefined): string {
  if (minDays <= 0) {
    return smallestPositive === undefined
      ? 'Any time before check-in'
      : `Less than ${plural(smallestPositive, 'day')}, or no-show`;
  }
  if (earlierMin === undefined) {
    return `${trimNumber(minDays)} or more days before`;
  }
  const last = earlierMin - 1;
  if (last <= minDays) {
    return `${plural(minDays, 'day')} before`;
  }
  return `${trimNumber(minDays)} to ${trimNumber(last)} days before`;
}

function windowText(checkIn: string, minDays: number, earlierMin: number | undefined): string | null {
  const end = shiftIsoDate(checkIn, -Math.max(minDays, 0));
  if (end === null) {
    return null;
  }
  if (earlierMin === undefined) {
    return `Until ${formatDayMonthYear(end)}`;
  }
  const start = shiftIsoDate(checkIn, -earlierMin);
  if (start === null) {
    return null;
  }
  return minDays <= 0
    ? `From ${formatDayMonthYear(start)}`
    : `${formatDayMonthYear(start)} to ${formatDayMonthYear(end)}`;
}

function refundText(percent: number): string {
  if (percent >= 100) {
    return 'Full refund';
  }
  if (percent <= 0) {
    return 'No refund';
  }
  return `${trimNumber(percent)}% refund`;
}

function plural(count: number, word: string): string {
  return `${trimNumber(count)} ${word}${count === 1 ? '' : 's'}`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number.parseFloat(value.toFixed(2)));
}
