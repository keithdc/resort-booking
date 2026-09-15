/**
 * @file apps/admin/src/features/reporting/utils/stay-window.ts
 * @feature reporting
 * @dependencies ISO date strings from the API — same predicates as Nest report rules
 */

import type { StaffReservation } from '@resort-booking/shared-types';

/**
 * Same occupancy window the API uses: [checkIn, checkOut).
 */
export function stayOccupiesDay(stay: StaffReservation, day: string): boolean {
  return day >= stay.checkIn && day < stay.checkOut;
}

/**
 * Future confirmed stay that has not arrived and has not already ended.
 */
export function isUpcomingArrivalStay(stay: StaffReservation, asOfDate: string): boolean {
  if (stay.kind !== 'reservation' || stay.status !== 'confirmed') {
    return false;
  }
  if (stay.arrivalStatus === 'checked_in' || stay.arrivalStatus === 'checked_out') {
    return false;
  }
  if (stay.checkOut <= asOfDate) {
    return false;
  }
  return stay.checkIn > asOfDate;
}

/**
 * Guest is on site: staff checked them in, or the dates occupy as-of.
 */
export function isInHouseStay(stay: StaffReservation, asOfDate: string): boolean {
  if (stay.kind !== 'reservation' || stay.status !== 'confirmed') {
    return false;
  }
  if (stay.arrivalStatus === 'checked_out') {
    return false;
  }
  if (stay.arrivalStatus === 'checked_in') {
    return true;
  }
  return stayOccupiesDay(stay, asOfDate);
}
