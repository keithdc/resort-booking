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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-12-10" -> "10 Dec". Not a date -> the text unchanged, so odd input never shows "NaN".
 */
export function formatShortDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  const month = match === null ? undefined : MONTHS[Number.parseInt(match[2] ?? '', 10) - 1];
  if (match === null || month === undefined) {
    return isoDate;
  }
  return `${String(Number.parseInt(match[3] ?? '', 10))} ${month}`;
}

/**
 * One-line summary of a stay search for a collapsed bar: "10 Dec – 12 Dec · 2 guests".
 */
export function summarizeStaySearch(checkIn: string, checkOut: string, guestCount: string): string {
  const guests = Number.parseInt(guestCount, 10);
  const guestText = Number.isInteger(guests) ? `${String(guests)} guest${guests === 1 ? '' : 's'}` : 'Guests';
  return `${formatShortDate(checkIn)} – ${formatShortDate(checkOut)} · ${guestText}`;
}
