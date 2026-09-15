/**
 * @file apps/admin/src/features/reporting/utils/stay-window.ts
 * @feature reporting
 * @dependencies ISO date strings from the API
 */

import type { StaffReservation } from '@resort-booking/shared-types';

/**
 * Same occupancy window the API uses: [checkIn, checkOut).
 */
export function stayOccupiesDay(stay: StaffReservation, day: string): boolean {
  return day >= stay.checkIn && day < stay.checkOut;
}

/**
 * UTC calendar day, matching Nest report "in-house now".
 */
export function utcTodayIso(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
