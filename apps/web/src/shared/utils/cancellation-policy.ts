/**
 * @file apps/web/src/shared/utils/cancellation-policy.ts
 * @shared Plain-language wording for the API's cancellation policy (display only)
 * @dependencies money
 */

import type { CancellationPolicy, CancellationPolicyTier } from '@resort-booking/shared-types';
import { formatCents } from './money';

export interface RefundRow {
  /** When the guest cancels, e.g. "7 days or more before check-in". */
  when: string;
  /** What they get back, e.g. "Full refund". */
  refund: string;
}

/**
 * Turns the refund ladder into rows a guest can read. The percentages are the API's; this only
 * words them. Tiers may arrive in any order.
 */
export function describeRefundRows(tiers: readonly CancellationPolicyTier[]): RefundRow[] {
  const ordered = [...tiers].sort((a, b): number => b.minDaysBeforeCheckIn - a.minDaysBeforeCheckIn);
  const smallestPositive = ordered
    .map((tier): number => tier.minDaysBeforeCheckIn)
    .filter((days): boolean => days > 0)
    .at(-1);
  return ordered.map((tier): RefundRow => ({
    when: whenText(tier.minDaysBeforeCheckIn, smallestPositive),
    refund: refundText(tier.refundPercent),
  }));
}

/**
 * One sentence about changing dates: allowed or not, and the fee.
 */
export function describeRebooking(policy: Pick<CancellationPolicy, 'rebookable' | 'rebookFeeType' | 'rebookFeeValue'>, currencyCode: string): string {
  if (!policy.rebookable) {
    return 'The dates of a booking cannot be changed. To change them, cancel (the refund above applies) and book again.';
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

function whenText(minDays: number, smallestPositive: number | undefined): string {
  if (minDays > 0) {
    return `${plural(minDays, 'day')} or more before check-in`;
  }
  if (smallestPositive === undefined) {
    return 'Any time before check-in';
  }
  return `Less than ${plural(smallestPositive, 'day')} before check-in, or if you do not arrive`;
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
