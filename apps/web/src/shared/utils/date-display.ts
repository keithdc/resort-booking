/**
 * @file apps/web/src/shared/utils/date-display.ts
 * @shared Date text for fields (display only)
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2027-07-10" -> "10/07/2027", the format the date field shows. Anything that is not a
 * YYYY-MM-DD date comes back as an empty string, so a half-typed value never shows junk.
 */
export function formatDateForField(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (match === null) {
    return '';
  }
  return `${match[3] ?? ''}/${match[2] ?? ''}/${match[1] ?? ''}`;
}
