/**
 * @file apps/api/src/modules/bookings/bookings.rules.ts
 * @feature bookings
 * @dependencies shared-types
 */

import type { CancellationPolicyTier } from '@resort-booking/shared-types';

export const BOOKING_STARTED_MESSAGE = 'This booking has already started. Please contact the property.';
export const BOOKING_CANCELLED_MESSAGE = 'This booking is already cancelled.';

const REFERENCE_HEX = /^[0-9a-f]{10}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- Booking reference ---

/**
 * Reads what a guest typed as a booking reference ("BK-1a2b3c4d5e", "BK1A2B3C4D5E", "1A2B3C4D5E", with spaces) into
 * the 10 lower-case hex characters it stands for. Null when it cannot be a reference.
 */
export function parseBookingReference(input: string): string | null {
  // The optional "BK" (with or without the dash) can never be confused with the hex that follows:
  // hexadecimal has no letter "k".
  const hex = input.replace(/\s+/g, '').toLowerCase().replace(/^bk-?/, '');
  return REFERENCE_HEX.test(hex) ? hex : null;
}

export interface UuidRange {
  low: string;
  high: string;
}

/**
 * The smallest and largest ids that start with the reference. A range lets the database use the
 * primary-key index instead of scanning every row to match a text prefix.
 */
export function referenceIdRange(prefixHex: string): UuidRange {
  return { low: formatUuid(prefixHex.padEnd(32, '0')), high: formatUuid(prefixHex.padEnd(32, 'f')) };
}

function formatUuid(hex32: string): string {
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

// --- Refund ---

export interface RefundCalculation {
  /** Whole days from today to check-in (0 on the day itself). */
  daysBeforeCheckIn: number;
  /** The minimum-days of the tier that applied, or null when there is no ladder. */
  tierMinDays: number | null;
  percent: number;
  refundCents: number;
}

export type CancellationCheck =
  | { allowed: true; calculation: RefundCalculation }
  | { allowed: false; reason: string };

/**
 * Whole days from `fromIso` to `toIso` (YYYY-MM-DD, calendar dates). Negative when `toIso` is earlier.
 */
export function wholeDaysBetween(fromIso: string, toIso: string): number {
  if (!ISO_DATE.test(fromIso) || !ISO_DATE.test(toIso)) {
    return Number.NaN;
  }
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** What an employee without refund access is told when changing the dates of a booking whose check-in is today or past. */
export const SAME_DAY_ADMIN_ONLY_MESSAGE = 'Check-in is today (or has passed). An admin has to cancel or change this booking.';

/** What an employee without refund access is told when cancelling on the check-in day (or later): the refund is zero. */
export const SAME_DAY_NO_REFUND_NOTICE =
  'Check-in is today: no refund applies. An admin or someone with refund access can decide otherwise.';

/** The refund's text when an employee without refund access cancels on or after the check-in day. */
export const SAME_DAY_NO_REFUND_LABEL = 'Staff cancelled on the check-in day without refund access: no refund';

/**
 * True when check-in is today or already past in the property's timezone (whole days remaining <= 0, counted exactly
 * like the refund ladder). An unreadable date counts as too close, so the safe answer is "admin only".
 */
export function isCheckInTodayOrPast(checkInIso: string, todayIso: string): boolean {
  const days = wholeDaysBetween(todayIso, checkInIso);
  return Number.isNaN(days) || days <= 0;
}

/**
 * The tier that applies `daysBefore` days before check-in: the one with the greatest minimum that is
 * still at or below the days remaining. Works on tiers in any order and never changes them.
 */
export function selectRefundTier(
  tiers: readonly CancellationPolicyTier[],
  daysBefore: number,
): CancellationPolicyTier | null {
  let chosen: CancellationPolicyTier | null = null;
  for (const tier of tiers) {
    if (tier.minDaysBeforeCheckIn <= daysBefore && (chosen === null || tier.minDaysBeforeCheckIn > chosen.minDaysBeforeCheckIn)) {
      chosen = tier;
    }
  }
  return chosen;
}

/**
 * What cancelling today refunds. The percentages come from the policy the booking was made under;
 * this only looks up the tier and does the arithmetic: round(paid * percent / 100), never more than
 * was paid, never negative. With no ladder (or no tier reaching this far out) nothing is refunded.
 */
export function calculateRefund(
  paidCents: number,
  checkInIso: string,
  todayIso: string,
  tiers: readonly CancellationPolicyTier[],
): RefundCalculation {
  const days = wholeDaysBetween(todayIso, checkInIso);
  const paid = Number.isInteger(paidCents) && paidCents > 0 ? paidCents : 0;
  const tier = Number.isNaN(days) ? null : selectRefundTier(tiers, days);
  const percent = tier === null ? 0 : Math.min(100, Math.max(0, tier.refundPercent));
  return {
    daysBeforeCheckIn: Number.isNaN(days) ? 0 : days,
    tierMinDays: tier === null ? null : tier.minDaysBeforeCheckIn,
    percent,
    refundCents: Math.min(paid, Math.max(0, Math.round((paid * percent) / 100))),
  };
}

/**
 * Can this booking still be cancelled online, and what would it refund? Cancelling is allowed up to
 * and including the check-in date. After that the guest has to talk to the property.
 */
export function checkCancellation(
  paidCents: number,
  checkInIso: string,
  todayIso: string,
  tiers: readonly CancellationPolicyTier[],
): CancellationCheck {
  const days = wholeDaysBetween(todayIso, checkInIso);
  if (Number.isNaN(days) || days < 0) {
    return { allowed: false, reason: BOOKING_STARTED_MESSAGE };
  }
  return { allowed: true, calculation: calculateRefund(paidCents, checkInIso, todayIso, tiers) };
}

// --- Paying a refund back across the payments that made up a booking ---

/** A succeeded payment that can still give money back. */
export interface RefundablePayment {
  id: string;
  provider: string;
  providerRef: string;
  /** What the payment took, less refunds already issued or pending against it. */
  refundableCents: number;
}

/** One provider refund call. */
export interface RefundChunk {
  paymentId: string;
  providerRef: string;
  provider: string;
  amountCents: number;
}

export interface RefundAllocation {
  chunks: RefundChunk[];
  /** What no payment could cover (for example money that was never paid online). */
  uncoveredCents: number;
}

/**
 * Spreads a refund over the booking's payments, newest first, never taking more from a payment than
 * it can still give back. A booking paid twice (the original plus a balance payment) refunds from both.
 */
export function allocateRefund(payments: readonly RefundablePayment[], amountCents: number): RefundAllocation {
  const chunks: RefundChunk[] = [];
  let remaining = Math.max(0, Math.round(amountCents));
  for (const payment of payments) {
    if (remaining === 0) {
      break;
    }
    const take = Math.min(remaining, Math.max(0, payment.refundableCents));
    if (take > 0) {
      chunks.push({ paymentId: payment.id, providerRef: payment.providerRef, provider: payment.provider, amountCents: take });
      remaining -= take;
    }
  }
  return { chunks, uncoveredCents: remaining };
}

/**
 * Reads the payments list the booking query aggregates. Anything malformed is dropped, so a bad row
 * can only mean "refund by hand", never a refund against the wrong payment.
 */
export function parseRefundablePayments(raw: unknown): RefundablePayment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const payments: RefundablePayment[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.id === 'string' &&
      typeof record.provider === 'string' &&
      typeof record.providerRef === 'string' &&
      typeof record.refundableCents === 'number'
    ) {
      payments.push({ id: record.id, provider: record.provider, providerRef: record.providerRef, refundableCents: record.refundableCents });
    }
  }
  return payments;
}

/**
 * A booking made on another website (Airbnb, Booking.com...) is paid and kept there. Here it holds the dates and is
 * reported, but money and date moves happen on that site. Plain words, no site name: a guest never learns the source.
 */
export const CHANNEL_BOOKING_MESSAGE = 'This booking was made on another website, so it is cancelled or changed there. Refunds are handled on that website.';
