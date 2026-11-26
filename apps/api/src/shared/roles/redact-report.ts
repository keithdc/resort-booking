/**
 * @file apps/api/src/shared/roles/redact-report.ts
 * @shared What an employee may see of the owner report: activity, not money
 * @dependencies shared-types
 */

import type { PeriodSummary, StaffReport, StaffReservation } from '@resort-booking/shared-types';

/** The report plus a flag telling the screen the money figures were withheld (zeroed), not really zero. */
export type RoleAwareReport = StaffReport & { moneyHidden: boolean };

/**
 * Employees see how busy the properties are (nights, occupancy, bookings, arrivals, cancellation counts) but
 * not revenue, averages, refunds, discounts given or booking amounts. The shape stays the same (money fields
 * are 0, lists of refunds are empty) so the screen does not break; `moneyHidden` says why. Pure: the input is
 * not changed.
 */
export function redactReportForEmployee(report: StaffReport): RoleAwareReport {
  return {
    ...report,
    revenueCents: 0,
    unpaidAtHotelCents: 0,
    averageNightlyCents: 0,
    grossRevenueCents: 0,
    refundedCents: 0,
    netRevenueCents: 0,
    pipeline: report.pipeline.map(withoutMoney),
    stays: report.stays.map(withoutMoney),
    properties: report.properties.map((property) => ({
      ...property,
      revenueCents: 0,
      houses: property.houses.map((house) => ({ ...house, revenueCents: 0 })),
    })),
    daily: report.daily.map((point) => ({ ...point, revenueCents: 0 })),
    paymentMethods: report.paymentMethods.map((slice) => ({ ...slice, revenueCents: 0 })),
    cancellationReasons: report.cancellationReasons.map((row) => ({ ...row, paidCents: 0, refundedCents: 0 })),
    refunds: [],
    discountUsage: report.discountUsage.map((row) => ({ ...row, discountCents: 0 })),
    attention: { ...report.attention, refundsToPayCents: 0, unpaidAtHotelCents: 0 },
    previous: previousWithoutMoney(report.previous),
    moneyHidden: true,
  };
}

/** Admins get the report as it is, with the flag off. */
export function keepReportForAdmin(report: StaffReport): RoleAwareReport {
  return { ...report, moneyHidden: false };
}

function previousWithoutMoney(previous: PeriodSummary): PeriodSummary {
  return { ...previous, averageNightlyCents: 0, grossRevenueCents: 0, refundedCents: 0, netRevenueCents: 0, unpaidAtHotelCents: 0 };
}

function withoutMoney(row: StaffReservation): StaffReservation {
  return { ...row, totalCents: 0, paidCents: 0, refunds: [] };
}
