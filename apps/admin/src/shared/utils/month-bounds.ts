/**
 * @file apps/admin/src/shared/utils/month-bounds.ts
 * @shared Month window for calendar API queries
 * @dependencies none
 */

export interface MonthBounds {
  year: number;
  month: number;
  from: string;
  to: string;
}

/**
 * Exclusive-end month range in UTC dates (YYYY-MM-DD). Occupancy still comes from the API.
 */
export function monthBounds(year: number, month: number): MonthBounds {
  const from = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${pad(nextMonth)}-01`;
  return { year, month, from, to };
}

/**
 * Local calendar year/month for staff (past months allowed).
 */
export function currentMonthBounds(now: Date): MonthBounds {
  return monthBounds(now.getFullYear(), now.getMonth() + 1);
}

/**
 * Staff local civil date (admin calendars are not UTC-shifted).
 */
export function localTodayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
