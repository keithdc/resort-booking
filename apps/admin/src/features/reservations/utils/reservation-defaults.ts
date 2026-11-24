/**
 * @file apps/admin/src/features/reservations/utils/reservation-defaults.ts
 * @feature reservations
 * @dependencies shared-types
 */

import type { StaffReport, StaffReservation } from '@resort-booking/shared-types';

/** The fields an API from before cancellations and refunds existed does not send. */
type NewerFields =
  | 'reference'
  | 'paidCents'
  | 'termsAcceptedAt'
  | 'cancellation'
  | 'replacedByReference'
  | 'rebookOfReference'
  | 'refunds'
  | 'changes';

/** A reservation as the API may send it: the newer fields can be missing from an older server. */
export type RawStaffReservation = Omit<StaffReservation, NewerFields> & Partial<Pick<StaffReservation, NewerFields>>;

/**
 * Fills in anything an older (not yet restarted) API leaves out, so no screen can crash on a missing
 * field. A current API sends every field, so for it this changes nothing.
 */
export function withReservationDefaults(raw: RawStaffReservation): StaffReservation {
  return {
    ...raw,
    reference: raw.reference ?? '',
    paidCents: raw.paidCents ?? 0,
    termsAcceptedAt: raw.termsAcceptedAt ?? null,
    cancellation: raw.cancellation ?? null,
    replacedByReference: raw.replacedByReference ?? null,
    rebookOfReference: raw.rebookOfReference ?? null,
    refunds: raw.refunds ?? [],
    changes: raw.changes ?? [],
  };
}

/**
 * The same for a report, whose pipeline and stays lists carry reservations.
 */
export function withReportDefaults(report: Omit<StaffReport, 'pipeline' | 'stays'> & { pipeline: RawStaffReservation[]; stays: RawStaffReservation[] }): StaffReport {
  return {
    ...report,
    pipeline: report.pipeline.map(withReservationDefaults),
    stays: report.stays.map(withReservationDefaults),
  };
}
