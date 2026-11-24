/**
 * @file apps/admin/src/features/reporting/utils/cancellation-summary.ts
 * @feature reporting
 * @dependencies shared-types, booking-labels
 */

import type { CancellationReasonRow, StaffReport } from '@resort-booking/shared-types';
import { reasonLabel } from '@/shared/utils/booking-labels';

export interface CancellationSummary {
  cancelledCount: number;
  paidCents: number;
  refundedCents: number;
  /** What was paid on cancelled bookings and not given back. */
  keptCents: number;
  ratePercent: number;
  reasons: ReasonBar[];
}

export interface ReasonBar {
  reason: string;
  label: string;
  cancelledCount: number;
  refundedCents: number;
  sharePercent: number;
}

/**
 * Totals for the cancellations tab, with each reason's share of all cancellations.
 */
export function summarizeCancellations(report: Pick<StaffReport, 'cancellationReasons' | 'cancellationRatePercent'>): CancellationSummary {
  const rows = report.cancellationReasons;
  const cancelledCount = rows.reduce((sum: number, row: CancellationReasonRow): number => sum + row.cancelledCount, 0);
  const paidCents = rows.reduce((sum: number, row: CancellationReasonRow): number => sum + row.paidCents, 0);
  const refundedCents = rows.reduce((sum: number, row: CancellationReasonRow): number => sum + row.refundedCents, 0);
  return {
    cancelledCount,
    paidCents,
    refundedCents,
    keptCents: paidCents - refundedCents,
    ratePercent: report.cancellationRatePercent,
    reasons: rows.map((row: CancellationReasonRow): ReasonBar => ({
      reason: row.reason,
      label: reasonLabel(row.reason),
      cancelledCount: row.cancelledCount,
      refundedCents: row.refundedCents,
      sharePercent: cancelledCount === 0 ? 0 : Math.round((row.cancelledCount / cancelledCount) * 100),
    })),
  };
}
