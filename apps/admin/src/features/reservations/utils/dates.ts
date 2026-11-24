/**
 * @file apps/admin/src/features/reservations/utils/dates.ts
 * @feature reservations
 * @dependencies none — calendar-date math for staff forms
 */

/**
 * Adds whole days to a YYYY-MM-DD date (UTC calendar math, no timezone drift). Unreadable input is returned unchanged.
 */
export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Whole nights between two dates, at least 1 (an unreadable or inverted range counts as one night).
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 1;
  }
  return Math.round((end - start) / 86_400_000);
}

/**
 * Staff nights field: a whole number from 1 to 60, anything else becomes 1.
 */
export function clampNights(nights: number): number {
  if (!Number.isInteger(nights) || nights < 1) {
    return 1;
  }
  return Math.min(nights, 60);
}

/**
 * Today's local calendar date as YYYY-MM-DD.
 */
export function todayLocalIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}
