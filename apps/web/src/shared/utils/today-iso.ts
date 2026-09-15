/**
 * @file apps/web/src/shared/utils/today-iso.ts
 * @shared Guest picker min date (UX only)
 * @dependencies none
 */

/**
 * Local calendar today as YYYY-MM-DD for guest date inputs.
 */
export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

/**
 * Local calendar date plus whole days, as YYYY-MM-DD.
 */
export function addDaysIsoDate(isoDate: string, days: number): string {
  const year = Number.parseInt(isoDate.slice(0, 4), 10);
  const month = Number.parseInt(isoDate.slice(5, 7), 10);
  const day = Number.parseInt(isoDate.slice(8, 10), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return isoDate;
  }
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

/**
 * Whole nights between two YYYY-MM-DD values. Invalid ranges become 1.
 */
export function nightsBetweenIso(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00`);
  const end = Date.parse(`${checkOut}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 1;
  }
  return Math.round((end - start) / 86_400_000);
}

/**
 * Guest night count: at least 1, at most 30.
 */
export function clampStayNights(nights: number): number {
  if (!Number.isInteger(nights) || nights < 1) {
    return 1;
  }
  return Math.min(nights, 30);
}

function toIsoDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
