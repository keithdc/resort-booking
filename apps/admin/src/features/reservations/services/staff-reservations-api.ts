/**
 * @file apps/admin/src/features/reservations/services/staff-reservations-api.ts
 * @feature reservations
 * @dependencies api-client
 */

import type {
  ArrivalStatus,
  ExtraService,
  PropertyBookingConfig,
  RebookQuote,
  StaffBookingQuote,
  StaffBookingQuoteRequest,
  StaffCalendar,
  StaffCancelPreview,
  StaffCancelRequest,
  StaffCancelResult,
  StaffChangeDatesRequest,
  StaffChangeQuoteRequest,
  StaffChangeResult,
  StaffCreateBookingRequest,
  StaffBookingNote,
  StaffReport,
  StaffReservation,
} from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';
import {
  withReportDefaults,
  withReservationDefaults,
  type RawStaffReport,
  type RawStaffReservation,
} from '../utils/reservation-defaults';

// The same results as the shared types, but a reservation may come from an API that is older than this
// app and lacks the newer fields. They are filled in right here (see reservation-defaults).
type RawStaffCancelResult = Omit<StaffCancelResult, 'reservation'> & { reservation: RawStaffReservation };
type RawStaffChangeResult = Omit<StaffChangeResult, 'reservation'> & { reservation: RawStaffReservation };

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
  return getStaffApiOk<RawStaffReservation[]>(`/staff/reservations?${params.toString()}`).then((rows): StaffReservation[] =>
    rows.map(withReservationDefaults),
  );
}

/**
 * Revenue and nights from the API.
 */
export function fetchStaffReport(from: string, to: string, propertyId: string): Promise<StaffReport> {
  const params = new URLSearchParams({ from, to });
  if (propertyId !== '') {
    params.set('propertyId', propertyId);
  }
  return getStaffApiOk<RawStaffReport>(`/staff/reports?${params.toString()}`).then(withReportDefaults);
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
  return mutateStaffApiOk<RawStaffReservation>(`/staff/reservations/${id}/arrival`, 'PATCH', {
    arrivalStatus,
  }).then(withReservationDefaults);
}

/**
 * What cancelling a booking for the guest would do: paid so far and what the saved policy refunds now.
 */
export function fetchStaffCancelPreview(reservationId: string): Promise<StaffCancelPreview> {
  return getStaffApiOk<StaffCancelPreview>(`/staff/reservations/${reservationId}/cancel-preview`);
}

/**
 * Cancels a booking for a guest. The reason, refund and note are kept on the record with the staff member.
 */
export function cancelStaffReservation(reservationId: string, body: StaffCancelRequest): Promise<StaffCancelResult> {
  return mutateStaffApiOk<RawStaffCancelResult>(`/staff/reservations/${reservationId}/cancel`, 'POST', body).then(
    (result): StaffCancelResult => ({ ...result, reservation: withReservationDefaults(result.reservation) }),
  );
}

/**
 * Prices a change of dates (fee optionally waived). Changes nothing.
 */
export function quoteStaffChangeDates(reservationId: string, body: StaffChangeQuoteRequest): Promise<RebookQuote> {
  return mutateStaffApiOk<RebookQuote>(`/staff/reservations/${reservationId}/change-dates/quote`, 'POST', body);
}

/**
 * Changes a guest's dates (works even when guests cannot do it themselves). The old booking is cancelled and replaced.
 */
export function changeStaffReservationDates(
  reservationId: string,
  body: StaffChangeDatesRequest,
): Promise<StaffChangeResult> {
  return mutateStaffApiOk<RawStaffChangeResult>(`/staff/reservations/${reservationId}/change-dates`, 'POST', body).then(
    (result): StaffChangeResult => ({ ...result, reservation: withReservationDefaults(result.reservation) }),
  );
}

/**
 * Prices a new booking for a guest and says whether the dates are free. Changes nothing.
 */
export function quoteStaffBooking(body: StaffBookingQuoteRequest): Promise<StaffBookingQuote> {
  return mutateStaffApiOk<StaffBookingQuote>('/staff/reservations/quote', 'POST', body);
}

/**
 * The extras a property offers guests (the published ones), for the New booking form. Admins and employees can both read it.
 */
export function fetchStaffBookingExtras(propertyId: string): Promise<ExtraService[]> {
  return getStaffApiOk<ExtraService[]>(`/staff/properties/${encodeURIComponent(propertyId)}/booking-extras`);
}

/**
 * Makes a booking for a guest who pays at the property. Confirmed at once, payment pending.
 */
export function createStaffBooking(body: StaffCreateBookingRequest): Promise<StaffReservation> {
  return mutateStaffApiOk<RawStaffReservation>('/staff/reservations', 'POST', body).then(withReservationDefaults);
}

/**
 * The guest paid at the property: marks the booking paid (once). Recorded with the staff member's name.
 */
export function markStaffReservationPaid(reservationId: string): Promise<StaffReservation> {
  return mutateStaffApiOk<RawStaffReservation>(`/staff/reservations/${reservationId}/mark-paid`, 'POST', {}).then(
    withReservationDefaults,
  );
}

/**
 * The internal staff notes of a booking, newest first. Only staff ever see these.
 */
export function fetchStaffBookingNotes(reservationId: string): Promise<StaffBookingNote[]> {
  return getStaffApiOk<StaffBookingNote[]>(`/staff/reservations/${encodeURIComponent(reservationId)}/notes`);
}

/**
 * Adds an internal note to a booking.
 */
export function addStaffBookingNote(reservationId: string, body: string): Promise<StaffBookingNote> {
  return mutateStaffApiOk<StaffBookingNote>(`/staff/reservations/${encodeURIComponent(reservationId)}/notes`, 'POST', { body });
}

/**
 * Hides a note (an admin any note, an employee their own). The server keeps a record of it.
 */
export function removeStaffBookingNote(reservationId: string, noteId: string): Promise<void> {
  return mutateStaffApiOk<{ removed: true }>(
    `/staff/reservations/${encodeURIComponent(reservationId)}/notes/${encodeURIComponent(noteId)}`,
    'DELETE',
  ).then((): void => undefined);
}
