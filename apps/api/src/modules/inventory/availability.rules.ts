/**
 * @file apps/api/src/modules/inventory/availability.rules.ts
 * @feature inventory
 * @dependencies shared-types
 */

import type { DateRange } from '@resort-booking/shared-types';
import { addDaysIso, addMonthsIso, isValidIsoDate } from '../../shared/dates/iso-date';

export const DEFAULT_AVAILABILITY_MONTHS = 12;
export const MAX_AVAILABILITY_MONTHS = 24;

export { addDaysIso, addMonthsIso };

export interface AvailabilityWindow {
  from: string;
  to: string;
}

export type AvailabilityWindowResult =
  | { ok: true; window: AvailabilityWindow }
  | { ok: false; code: 'INVALID_DATES' | 'WINDOW_TOO_LARGE'; message: string };

/**
 * Resolves the requested window. Guests never see the past, so `from` is raised to today.
 * Defaults to today through 12 months; rejects inverted ranges and windows over 24 months.
 */
export function resolveAvailabilityWindow(
  from: string | undefined,
  to: string | undefined,
  today: string,
): AvailabilityWindowResult {
  if ((from !== undefined && !isValidIsoDate(from)) || (to !== undefined && !isValidIsoDate(to))) {
    return { ok: false, code: 'INVALID_DATES', message: 'Dates must be valid YYYY-MM-DD values' };
  }
  const start = from !== undefined && from > today ? from : today;
  const end = to ?? addMonthsIso(start, DEFAULT_AVAILABILITY_MONTHS);
  if (end <= start) {
    return { ok: false, code: 'INVALID_DATES', message: 'The end date must be after the start date' };
  }
  if (end > addMonthsIso(start, MAX_AVAILABILITY_MONTHS)) {
    return {
      ok: false,
      code: 'WINDOW_TOO_LARGE',
      message: `Availability windows are limited to ${String(MAX_AVAILABILITY_MONTHS)} months`,
    };
  }
  return { ok: true, window: { from: start, to: end } };
}

/**
 * Sorts, clips to the window, and merges ranges. Ranges that touch or overlap merge, because
 * the shared day is an occupied night. A range stays separate only when a free night sits between.
 */
export function mergeRanges(ranges: readonly DateRange[], window: AvailabilityWindow): DateRange[] {
  const clipped = ranges
    .map((range): DateRange => ({
      startDate: range.startDate < window.from ? window.from : range.startDate,
      endDate: range.endDate > window.to ? window.to : range.endDate,
    }))
    .filter((range): boolean => range.startDate < range.endDate)
    .sort((a, b): number => a.startDate.localeCompare(b.startDate));

  const merged: DateRange[] = [];
  for (const range of clipped) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.startDate <= last.endDate) {
      if (range.endDate > last.endDate) {
        last.endDate = range.endDate;
      }
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Nights that are in every list. Used for "no house at the property is free".
 * An empty input (no houses) yields no fully-booked nights.
 */
export function intersectRangeLists(lists: readonly (readonly DateRange[])[]): DateRange[] {
  const [first, ...rest] = lists;
  if (first === undefined) {
    return [];
  }
  let current: DateRange[] = first.map((range): DateRange => ({ ...range }));
  for (const list of rest) {
    const next: DateRange[] = [];
    for (const a of current) {
      for (const b of list) {
        const startDate = a.startDate > b.startDate ? a.startDate : b.startDate;
        const endDate = a.endDate < b.endDate ? a.endDate : b.endDate;
        if (startDate < endDate) {
          next.push({ startDate, endDate });
        }
      }
    }
    current = next;
  }
  return current.sort((a, b): number => a.startDate.localeCompare(b.startDate));
}

/**
 * True when the night of `checkIn` is occupied, so it cannot be a check-in day.
 */
export function isNightOccupied(ranges: readonly DateRange[], checkIn: string): boolean {
  return ranges.some((range): boolean => range.startDate <= checkIn && checkIn < range.endDate);
}

/**
 * Latest valid check-out for a check-in: the day the next stay starts, else the window end.
 */
export function maxCheckOutDate(
  ranges: readonly DateRange[],
  checkIn: string,
  windowEnd: string,
): string {
  const next = ranges.find((range): boolean => range.startDate > checkIn);
  return next === undefined ? windowEnd : next.startDate;
}
