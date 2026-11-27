/**
 * @file apps/admin/src/features/reporting/utils/bookings-filter.ts
 * @feature reporting
 * @dependencies report-labels
 */

import type { BookingSource, StaffRefund, StaffReservation } from '@resort-booking/shared-types';
import { bookingStatusKey, isUnpaidAtHotel, type BookingFilter } from './report-labels';

/** True when the booking belongs under this filter. */
function matchesFilter(row: StaffReservation, status: BookingFilter): boolean {
  return status === 'unpaid_at_hotel' ? isUnpaidAtHotel(row) : bookingStatusKey(row) === status;
}

/**
 * Bookings and holds that match the status filter and the search text, in the order given. `status` null means every
 * status. Search looks at guest, email, reference, stay and property. The "Unpaid at hotel" filter lists the soonest
 * check-in first, so the guests who arrive first (or already did) are the first money to collect.
 */
export function filterBookings(
  rows: readonly StaffReservation[],
  status: BookingFilter | null,
  search: string,
  source: BookingSource | null = null,
): StaffReservation[] {
  const needle = search.trim().toLowerCase();
  const matching = rows.filter((row: StaffReservation): boolean => {
    if (status !== null && !matchesFilter(row, status)) {
      return false;
    }
    if (source !== null && row.bookingSource !== source) {
      return false;
    }
    if (needle === '') {
      return true;
    }
    return [row.bookerName, row.bookerEmail, row.reference, row.houseName, row.propertyName].some(
      (field: string): boolean => field.toLowerCase().includes(needle),
    );
  });
  return status === 'unpaid_at_hotel'
    ? [...matching].sort((a: StaffReservation, b: StaffReservation): number => a.checkIn.localeCompare(b.checkIn) || a.reference.localeCompare(b.reference))
    : matching;
}

/** How many bookings came from each source (for the source filter chips). */
export function countBySource(rows: readonly StaffReservation[]): Record<BookingSource, number> {
  const counts: Record<BookingSource, number> = { website: 0, airbnb: 0, booking_com: 0, other_site: 0, phone_email: 0, walk_in: 0 };
  for (const row of rows) {
    counts[row.bookingSource] += 1;
  }
  return counts;
}

/**
 * How many bookings are in each status, and how many are unpaid at the hotel (for the filter chips).
 */
export function countByStatus(rows: readonly StaffReservation[]): Record<BookingFilter, number> {
  const counts: Record<BookingFilter, number> = { confirmed: 0, awaiting_payment: 0, cancelled: 0, expired: 0, unpaid_at_hotel: 0 };
  for (const row of rows) {
    counts[bookingStatusKey(row)] += 1;
    if (isUnpaidAtHotel(row)) {
      counts.unpaid_at_hotel += 1;
    }
  }
  return counts;
}

/**
 * The report lists bookings without their refunds (to keep it light). Before opening one, attach the
 * refunds the report did load for it, so a cancelled booking does not look as if nothing was refunded.
 */
export function withReportRefunds(row: StaffReservation, refunds: readonly StaffRefund[]): StaffReservation {
  return { ...row, refunds: refunds.filter((refund: StaffRefund): boolean => refund.reservationId === row.id) };
}
