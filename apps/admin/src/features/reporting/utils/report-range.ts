/**
 * @file apps/admin/src/features/reporting/utils/report-range.ts
 * @feature reporting
 * @dependencies none — converts a named period to from/to for the reports API
 */

export type RangePreset = 'this_month' | 'last_month' | 'next_30' | 'this_year' | 'custom';

export interface ReportRangeOption {
  value: RangePreset;
  label: string;
}

/** The owner's periods, in the order they appear. */
export const REPORT_RANGE_OPTIONS: ReportRangeOption[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'next_30', label: 'Next 30 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

export const DEFAULT_REPORT_PRESET: RangePreset = 'this_month';

/** A custom period longer than this is refused: the daily chart would be unreadable. */
export const MAX_CUSTOM_RANGE_DAYS = 400;

export function isRangePreset(value: string): value is RangePreset {
  return REPORT_RANGE_OPTIONS.some((option): boolean => option.value === value);
}

/**
 * Local calendar dates. `to` is exclusive (first day after the period). Not for `custom`.
 */
export function rangeFromPreset(preset: Exclude<RangePreset, 'custom'>, now: Date): { from: string; to: string } {
  if (preset === 'this_month') {
    return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: toIso(new Date(now.getFullYear(), now.getMonth() + 1, 1)) };
  }
  if (preset === 'last_month') {
    return {
      from: toIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
    };
  }
  if (preset === 'this_year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear() + 1}-01-01` };
  }
  return { from: toIso(now), to: shiftIso(toIso(now), 30) };
}

/**
 * Turns the two date fields (both inclusive, as people think of them) into the API range, or says
 * what is wrong with them.
 */
export function customRange(
  firstDay: string,
  lastDay: string,
): { range: { from: string; to: string }; problem: null } | { range: null; problem: string } {
  if (firstDay === '' || lastDay === '') {
    return { range: null, problem: 'Pick a first and a last day.' };
  }
  if (lastDay < firstDay) {
    return { range: null, problem: 'The last day cannot be before the first day.' };
  }
  const to = shiftIso(lastDay, 1);
  if (daysBetween(firstDay, to) > MAX_CUSTOM_RANGE_DAYS) {
    return { range: null, problem: `Pick at most ${MAX_CUSTOM_RANGE_DAYS} days.` };
  }
  return { range: { from: firstDay, to }, problem: null };
}

/**
 * "1 Jul – 31 Jul 2027" for a period whose `to` is exclusive.
 */
export function describePeriod(from: string, to: string): string {
  const last = shiftIso(to, -1);
  const format = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const formatYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  if (from === last) {
    return formatYear.format(start);
  }
  return `${start.getUTCFullYear() === end.getUTCFullYear() ? format.format(start) : formatYear.format(start)} – ${formatYear.format(end)}`;
}

/**
 * Nights in [from, to).
 */
export function periodNights(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Calendar-day arithmetic on YYYY-MM-DD strings (UTC, so no daylight-saving drift).
 */
export function shiftIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
