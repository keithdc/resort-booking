/**
 * @file apps/web/src/shared/utils/iso-date-text.ts
 * @shared Calendar-date arithmetic and wording for display (UTC math, no time zones)
 * @dependencies none
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS: readonly string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseIso(isoDate: string): DateParts | null {
  const match = ISO_DATE.exec(isoDate);
  if (match === null) {
    return null;
  }
  const year = Number.parseInt(match[1] ?? '', 10);
  const month = Number.parseInt(match[2] ?? '', 10);
  const day = Number.parseInt(match[3] ?? '', 10);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/**
 * True for a real calendar date written as YYYY-MM-DD ("2027-02-30" is not).
 */
export function isRealIsoDate(isoDate: string): boolean {
  return parseIso(isoDate) !== null;
}

/**
 * Shifts a YYYY-MM-DD date by whole days (negative = earlier). Calendar math in UTC, so daylight
 * saving never moves the result. Returns null when the input is not a real date.
 */
export function shiftIsoDate(isoDate: string, days: number): string | null {
  const parts = parseIso(isoDate);
  if (parts === null) {
    return null;
  }
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

/**
 * "2026-12-03" -> "3 Dec 2026". Empty string when the input is not a real date.
 */
export function formatDayMonthYear(isoDate: string): string {
  const parts = parseIso(isoDate);
  if (parts === null) {
    return '';
  }
  return `${parts.day} ${MONTHS[parts.month - 1] ?? ''} ${parts.year}`;
}

/**
 * "2026-07-10" -> "10 Jul". Empty string when the input is not a real date.
 */
export function formatDayMonth(isoDate: string): string {
  const parts = parseIso(isoDate);
  if (parts === null) {
    return '';
  }
  return `${parts.day} ${MONTHS[parts.month - 1] ?? ''}`;
}
