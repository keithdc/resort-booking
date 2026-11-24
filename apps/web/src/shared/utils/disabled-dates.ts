/**
 * @file apps/web/src/shared/utils/disabled-dates.ts
 * @shared Picker helpers over API-provided unavailable ranges (UX only; Nest still rejects overlaps)
 * @dependencies shared-types
 */

import type { DateRange } from '@resort-booking/shared-types';

/**
 * True when the day sits inside an unavailable range. Ranges are [start, end): the end day
 * is a check-out day and stays pickable as a check-in.
 */
export function isDayUnavailable(ranges: readonly DateRange[], isoDate: string): boolean {
  return ranges.some((range): boolean => range.startDate <= isoDate && isoDate < range.endDate);
}

/**
 * A guest check-in is disabled in the past or on an occupied night.
 */
export function isCheckInDisabled(
  ranges: readonly DateRange[],
  isoDate: string,
  todayIso: string,
): boolean {
  return isoDate < todayIso || isDayUnavailable(ranges, isoDate);
}

/**
 * Most nights the guest can stay from `checkIn` given the API's latest check-out.
 * Null when the API sent no limit.
 */
export function maxNightsFor(checkIn: string, maxCheckOutDate: string | null): number | null {
  if (maxCheckOutDate === null) {
    return null;
  }
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${maxCheckOutDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.round((end - start) / 86_400_000);
}
