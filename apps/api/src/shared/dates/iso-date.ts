/**
 * @file apps/api/src/shared/dates/iso-date.ts
 * @shared Calendar-date math on YYYY-MM-DD strings (UTC, no timezone drift)
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a real calendar date in YYYY-MM-DD form (rejects 2027-02-30).
 */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const date = parseIso(value);
  return !Number.isNaN(date.getTime()) && formatIso(date) === value;
}

/**
 * Adds whole days to a YYYY-MM-DD date.
 */
export function addDaysIso(isoDate: string, days: number): string {
  const date = parseIso(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIso(date);
}

/**
 * Adds whole months, clamping to the last day of a shorter month (Jan 31 + 1 month = Feb 28/29).
 */
export function addMonthsIso(isoDate: string, months: number): string {
  const date = parseIso(isoDate);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return formatIso(date);
}

function parseIso(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map((part): number => Number.parseInt(part, 10));
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function formatIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
