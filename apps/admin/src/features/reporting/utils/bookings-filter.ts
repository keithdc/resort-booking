/**
 * @file apps/admin/src/features/reporting/utils/bookings-filter.ts
 * @feature reporting
 * @dependencies report-labels
 */

import type { StaffReservation } from '@resort-booking/shared-types';
import { bookingStatusKey, type BookingStatusKey } from './report-labels';

/**
 * Bookings and holds that match the status filter and the search text, in the order given.
 * `status` null means every status. Search looks at guest, email, reference, stay and property.
 */
export function filterBookings(
  rows: readonly StaffReservation[],
  status: BookingStatusKey | null,
  search: string,
): StaffReservation[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row: StaffReservation): boolean => {
    if (status !== null && bookingStatusKey(row) !== status) {
      return false;
    }
    if (needle === '') {
      return true;
    }
    return [row.bookerName, row.bookerEmail, row.reference, row.houseName, row.propertyName].some(
      (field: string): boolean => field.toLowerCase().includes(needle),
    );
  });
}

/**
 * How many bookings are in each status (for the filter chips).
 */
export function countByStatus(rows: readonly StaffReservation[]): Record<BookingStatusKey, number> {
  const counts: Record<BookingStatusKey, number> = { confirmed: 0, awaiting_payment: 0, cancelled: 0, expired: 0 };
  for (const row of rows) {
    counts[bookingStatusKey(row)] += 1;
  }
  return counts;
}
