/**
 * @file apps/admin/src/features/reporting/utils/cancellation-summary.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { summarizeCancellations } from './cancellation-summary';

describe('summarizeCancellations', () => {
  const rows = [
    { reason: 'guest_request', cancelledCount: 3, paidCents: 90000, refundedCents: 30000 },
    { reason: 'property_cancelled', cancelledCount: 1, paidCents: 20000, refundedCents: 20000 },
  ];

  it('adds the reasons up and works out what was kept', () => {
    const summary = summarizeCancellations({ cancellationReasons: rows, cancellationRatePercent: 20 });

    expect(summary).toMatchObject({ cancelledCount: 4, paidCents: 110000, refundedCents: 50000, keptCents: 60000, ratePercent: 20 });
  });

  it('gives each reason a plain label and its share of the cancellations', () => {
    const { reasons } = summarizeCancellations({ cancellationReasons: rows, cancellationRatePercent: 20 });

    expect(reasons.map((reason) => [reason.label, reason.sharePercent])).toEqual([
      ['Guest asked', 75],
      ['We could not host', 25],
    ]);
  });

  it('is all zero without cancellations', () => {
    expect(summarizeCancellations({ cancellationReasons: [], cancellationRatePercent: 0 })).toEqual({
      cancelledCount: 0, paidCents: 0, refundedCents: 0, keptCents: 0, ratePercent: 0, reasons: [],
    });
  });

  it('shows an unknown reason readably instead of hiding it', () => {
    const { reasons } = summarizeCancellations({ cancellationReasons: [{ reason: 'weather', cancelledCount: 1, paidCents: 0, refundedCents: 0 }], cancellationRatePercent: 0 });

    expect(reasons[0]?.label).toBe('Weather');
  });
});
