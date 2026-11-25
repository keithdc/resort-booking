/**
 * @file apps/admin/src/features/reporting/utils/report-range.ts
 * @feature reporting
 * @dependencies none — converts a named period to from/to for the reports API
 */

export type RangePreset =
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'last_30'
  | 'next_30'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface ReportRangeOption {
  value: RangePreset;
  label: string;
  /** Heading the option sits under in the period menu. */
  group: 'Days and weeks' | 'Months' | 'Quarters and years' | 'Your own dates';
}

/** The owner's periods, in the order they appear. Weeks run Monday to Sunday. */
export const REPORT_RANGE_OPTIONS: ReportRangeOption[] = [
  { value: 'today', label: 'Today', group: 'Days and weeks' },
  { value: 'this_week', label: 'This week', group: 'Days and weeks' },
  { value: 'last_week', label: 'Last week', group: 'Days and weeks' },
  { value: 'last_30', label: 'Last 30 days', group: 'Days and weeks' },
  { value: 'next_30', label: 'Next 30 days', group: 'Days and weeks' },
  { value: 'this_month', label: 'This month', group: 'Months' },
  { value: 'last_month', label: 'Last month', group: 'Months' },
  { value: 'this_quarter', label: 'This quarter', group: 'Quarters and years' },
  { value: 'last_quarter', label: 'Last quarter', group: 'Quarters and years' },
  { value: 'this_year', label: 'This year', group: 'Quarters and years' },
  { value: 'last_year', label: 'Last year', group: 'Quarters and years' },
  { value: 'custom', label: 'Custom dates', group: 'Your own dates' },
];

export const DEFAULT_REPORT_PRESET: RangePreset = 'this_month';

/** A custom period longer than this is refused: the daily chart would be unreadable. */
export const MAX_CUSTOM_RANGE_DAYS = 400;

export function isRangePreset(value: string): value is RangePreset {
  return REPORT_RANGE_OPTIONS.some((option): boolean => option.value === value);
}

/**
 * Local calendar dates. `to` is exclusive (first day after the period). Not for `custom`.
 * Weeks start on Monday; a quarter is three calendar months (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec).
 */
export function rangeFromPreset(preset: Exclude<RangePreset, 'custom'>, now: Date): { from: string; to: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = toIso(now);
  switch (preset) {
    case 'today':
      return { from: today, to: shiftIso(today, 1) };
    case 'this_week': {
      const monday = shiftIso(today, -((now.getDay() + 6) % 7));
      return { from: monday, to: shiftIso(monday, 7) };
    }
    case 'last_week': {
      const monday = shiftIso(today, -((now.getDay() + 6) % 7));
      return { from: shiftIso(monday, -7), to: monday };
    }
    case 'last_30':
      return { from: shiftIso(today, -29), to: shiftIso(today, 1) };
    case 'next_30':
      return { from: today, to: shiftIso(today, 30) };
    case 'this_month':
      return { from: toIso(new Date(year, month, 1)), to: toIso(new Date(year, month + 1, 1)) };
    case 'last_month':
      return { from: toIso(new Date(year, month - 1, 1)), to: toIso(new Date(year, month, 1)) };
    case 'this_quarter': {
      const first = Math.floor(month / 3) * 3;
      return { from: toIso(new Date(year, first, 1)), to: toIso(new Date(year, first + 3, 1)) };
    }
    case 'last_quarter': {
      const first = Math.floor(month / 3) * 3;
      return { from: toIso(new Date(year, first - 3, 1)), to: toIso(new Date(year, first, 1)) };
    }
    case 'this_year':
      return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
    case 'last_year':
      return { from: `${year - 1}-01-01`, to: `${year}-01-01` };
  }
}

/**
 * The dates a preset covers right now, in words ("1 Nov – 30 Nov 2026"), for the period menu and the label
 * next to it. Empty for `custom`, which has its own date fields.
 */
export function describePreset(preset: RangePreset, now: Date): string {
  if (preset === 'custom') {
    return '';
  }
  const { from, to } = rangeFromPreset(preset, now);
  return describePeriod(from, to);
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
