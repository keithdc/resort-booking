/**
 * @file apps/admin/src/features/reservations/services/staff-reservations-api.ts
 * @feature reservations
 * @dependencies api-client
 */

import type {
  ArrivalStatus,
  PropertyBookingConfig,
  StaffCalendar,
  StaffReport,
  StaffReservation,
} from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/**
 * Occupancy dots for the staff calendar.
 */
export function fetchStaffCalendar(
  from: string,
  to: string,
  propertyId: string,
): Promise<StaffCalendar> {
  const params = new URLSearchParams({ from, to });
  if (propertyId !== '') {
    params.set('propertyId', propertyId);
  }
  return getStaffApiOk<StaffCalendar>(`/staff/calendar?${params.toString()}`);
}

/**
 * Guests occupying a night.
 */
export function fetchStaffReservationsOnDate(
  onDate: string,
  propertyId: string,
): Promise<StaffReservation[]> {
  const params = new URLSearchParams({ onDate });
  if (propertyId !== '') {
    params.set('propertyId', propertyId);
  }
  return getStaffApiOk<StaffReservation[]>(`/staff/reservations?${params.toString()}`);
}

/**
 * Revenue and nights from the API.
 */
export function fetchStaffReport(from: string, to: string, propertyId: string): Promise<StaffReport> {
  const params = new URLSearchParams({ from, to });
  if (propertyId !== '') {
    params.set('propertyId', propertyId);
  }
  return getStaffApiOk<StaffReport>(`/staff/reports?${params.toString()}`);
}

/**
 * Cancellation / rebook settings.
 */
export function fetchStaffConfiguration(): Promise<PropertyBookingConfig[]> {
  return getStaffApiOk<PropertyBookingConfig[]>('/staff/configuration');
}

/**
 * Staff check-in or check-out. Payment status stays confirmed.
 */
export function patchStaffReservationArrival(
  id: string,
  arrivalStatus: ArrivalStatus,
): Promise<StaffReservation> {
  return mutateStaffApiOk<StaffReservation>(`/staff/reservations/${id}/arrival`, 'PATCH', {
    arrivalStatus,
  });
}
