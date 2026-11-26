/**
 * @file apps/admin/src/features/reservations/utils/reservation-defaults.ts
 * @feature reservations
 * @dependencies shared-types
 */

import type { PropertyReportRow, StaffReport, StaffReservation } from '@resort-booking/shared-types';

/** The fields an API from before cancellations and refunds existed does not send. */
type NewerFields =
  | 'reference'
  | 'paidCents'
  | 'paymentStatus'
  | 'paidAt'
  | 'createdByName'
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
    paymentStatus: raw.paymentStatus ?? 'paid',
    paidAt: raw.paidAt ?? null,
    createdByName: raw.createdByName ?? null,
    termsAcceptedAt: raw.termsAcceptedAt ?? null,
    cancellation: raw.cancellation ?? null,
    replacedByReference: raw.replacedByReference ?? null,
    rebookOfReference: raw.rebookOfReference ?? null,
    refunds: raw.refunds ?? [],
    changes: raw.changes ?? [],
  };
}

/** The report fields an API from before the owner report existed does not send. */
type NewerReportFields =
  | 'grossRevenueCents'
  | 'refundedCents'
  | 'netRevenueCents'
  | 'cancellationRatePercent'
  | 'cancellationReasons'
  | 'refunds'
  | 'discountUsage'
  | 'attention'
  | 'previous';

type RawPropertyReportRow = Omit<PropertyReportRow, 'houseCount'> & Partial<Pick<PropertyReportRow, 'houseCount'>>;

/** A report as the API may send it: older servers lack the newer fields and carry raw reservations. */
export type RawStaffReport = Omit<StaffReport, 'pipeline' | 'stays' | 'properties' | NewerReportFields> &
  Partial<Pick<StaffReport, NewerReportFields>> & {
    pipeline: RawStaffReservation[];
    stays: RawStaffReservation[];
    properties: RawPropertyReportRow[];
  };

/**
 * The same for a report, whose pipeline and stays lists carry reservations. The owner-report numbers
 * an old API does not send fall back to what the older fields already say, or to zero.
 */
export function withReportDefaults(report: RawStaffReport): StaffReport {
  return {
    ...report,
    pipeline: report.pipeline.map(withReservationDefaults),
    stays: report.stays.map(withReservationDefaults),
    properties: report.properties.map(
      (property: RawPropertyReportRow): PropertyReportRow => ({ ...property, houseCount: property.houseCount ?? property.houses.length }),
    ),
    grossRevenueCents: report.grossRevenueCents ?? report.revenueCents,
    refundedCents: report.refundedCents ?? 0,
    netRevenueCents: report.netRevenueCents ?? report.revenueCents,
    cancellationRatePercent: report.cancellationRatePercent ?? 0,
    cancellationReasons: report.cancellationReasons ?? [],
    refunds: report.refunds ?? [],
    discountUsage: report.discountUsage ?? [],
    attention: report.attention ?? {
      unpaidHoldCount: 0,
      refundsToPayCount: 0,
      refundsToPayCents: 0,
      arrivalsTodayCount: 0,
      arrivalsNext7DaysCount: 0,
    },
    previous: report.previous ?? {
      from: report.from,
      to: report.from,
      reservationCount: 0,
      occupiedNights: 0,
      occupancyPercent: 0,
      averageNightlyCents: 0,
      grossRevenueCents: 0,
      refundedCents: 0,
      netRevenueCents: 0,
      cancelledCount: 0,
      cancellationRatePercent: 0,
    },
  };
}
