/**
 * @file apps/admin/src/features/reporting/utils/report-range.ts
 * @feature reporting
 * @dependencies none — converts a named window to from/to for the reports API
 */

export type RangePreset =
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_30'
  | 'last_90'
  | 'next_90'
  | 'this_year';

export interface ReportRangeOption {
  value: RangePreset;
  label: string;
}

export const REPORT_RANGE_OPTIONS: ReportRangeOption[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'next_90', label: 'Next 90 days' },
  { value: 'this_year', label: 'This year' },
];

export const DEFAULT_REPORT_PRESET: RangePreset = 'this_week';

export function isRangePreset(value: string): value is RangePreset {
  return REPORT_RANGE_OPTIONS.some((option): boolean => option.value === value);
}

/**
 * Local calendar dates. `to` is exclusive (first day after the window).
 */
export function rangeFromPreset(preset: RangePreset, now: Date): { from: string; to: string } {
  if (preset === 'this_week') {
    const monday = startOfWeekMonday(now);
    return { from: toIso(monday), to: shiftIso(monday, 7) };
  }
  if (preset === 'this_month') {
    const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to: toIso(end) };
  }
  if (preset === 'last_month') {
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const toDate = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toIso(fromDate), to: toIso(toDate) };
  }
  if (preset === 'this_year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear() + 1}-01-01` };
  }
  if (preset === 'last_90') {
    return { from: shiftIso(now, -90), to: shiftIso(now, 1) };
  }
  if (preset === 'next_90') {
    return { from: toIso(now), to: shiftIso(now, 90) };
  }
  return { from: shiftIso(now, -30), to: shiftIso(now, 1) };
}

function startOfWeekMonday(now: Date): Date {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - mondayOffset);
  return day;
}

function shiftIso(now: Date, days: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return toIso(date);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
