/**
 * @file apps/api/src/modules/reservations/reservations.rules.ts
 * @feature reservations
 * @dependencies inventory.rules
 */

import type { CancellationTierWrite } from '@resort-booking/shared-types';
import { nightsBetween } from '../inventory/inventory.rules';

export const DEFAULT_CANCELLATION_TIERS: CancellationTierWrite[] = [
  { minDaysBeforeCheckIn: 7, refundPercent: 100 },
  { minDaysBeforeCheckIn: 3, refundPercent: 75 },
  { minDaysBeforeCheckIn: 1, refundPercent: 25 },
  { minDaysBeforeCheckIn: 0, refundPercent: 0 },
];

/**
 * Rejects empty, duplicate, or out-of-range ladders. Percents are never hardcoded in callers.
 */
export function validateCancellationTiers(tiers: CancellationTierWrite[]): string | null {
  if (tiers.length === 0) {
    return 'At least one cancellation tier is required';
  }
  const days = new Set<number>();
  let hasCatchAll = false;
  for (const tier of tiers) {
    if (!Number.isInteger(tier.minDaysBeforeCheckIn) || tier.minDaysBeforeCheckIn < 0) {
      return 'Days before check-in must be a whole number of 0 or more';
    }
    if (!Number.isInteger(tier.refundPercent) || tier.refundPercent < 0 || tier.refundPercent > 100) {
      return 'Refund percent must be an integer from 0 to 100';
    }
    if (days.has(tier.minDaysBeforeCheckIn)) {
      return 'Each days-before-check-in value must be unique on a property';
    }
    days.add(tier.minDaysBeforeCheckIn);
    if (tier.minDaysBeforeCheckIn === 0) {
      hasCatchAll = true;
    }
  }
  if (!hasCatchAll) {
    return 'Keep a 0-day catch-all tier';
  }
  return null;
}

/**
 * Farther-out tiers that refund less than closer ones — usually a staff mistake.
 */
export function hasInvertedRefundLadder(tiers: CancellationTierWrite[]): boolean {
  const sorted = [...tiers].sort(
    (left: CancellationTierWrite, right: CancellationTierWrite): number =>
      right.minDaysBeforeCheckIn - left.minDaysBeforeCheckIn,
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const earlier = sorted[i - 1];
    const later = sorted[i];
    if (earlier === undefined || later === undefined) {
      continue;
    }
    if (earlier.refundPercent < later.refundPercent) {
      return true;
    }
  }
  return false;
}

/**
 * True when the stay occupies this calendar date (checkout exclusive).
 */
export function stayOccupiesDate(checkIn: string, checkOut: string, day: string): boolean {
  return day >= checkIn && day < checkOut;
}

/**
 * Each YYYY-MM-DD from fromInclusive up to, not including, toExclusive.
 */
export function eachIsoDate(fromInclusive: string, toExclusive: string): string[] {
  const nights = nightsBetween(fromInclusive, toExclusive);
  if (nights === null) {
    return [];
  }
  const dates: string[] = [];
  const start = Date.parse(`${fromInclusive}T00:00:00Z`);
  for (let i = 0; i < nights; i += 1) {
    dates.push(isoFromUtcMs(start + i * 86_400_000));
  }
  return dates;
}

/**
 * Nights of a stay that fall inside [from, to).
 */
export function overlapNights(
  checkIn: string,
  checkOut: string,
  from: string,
  toExclusive: string,
): number {
  const start = checkIn > from ? checkIn : from;
  const end = checkOut < toExclusive ? checkOut : toExclusive;
  const n = nightsBetween(start, end);
  return n === null ? 0 : n;
}

function isoFromUtcMs(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
