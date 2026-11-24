/**
 * @file apps/admin/src/shared/utils/format-date.ts
 * @shared Display-only date formatting for staff lists
 */

/**
 * "2027-07-01" -> "1 Jul 2027". Calendar math is UTC so the day never shifts with the browser
 * timezone. Returns the input unchanged when it is not a date.
 */
export function formatIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
