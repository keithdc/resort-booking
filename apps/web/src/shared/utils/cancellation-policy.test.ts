/**
 * @file apps/web/src/shared/utils/cancellation-policy.test.ts
 * @shared Cancellation policy wording
 */

import { describe, expect, it } from 'vitest';
import { describeRebooking, describeRefundRows } from './cancellation-policy';

describe('describeRefundRows', () => {
  it('words the sample ladder in order, highest days first', () => {
    expect(
      describeRefundRows([
        { minDaysBeforeCheckIn: 0, refundPercent: 0 },
        { minDaysBeforeCheckIn: 7, refundPercent: 100 },
        { minDaysBeforeCheckIn: 3, refundPercent: 75 },
        { minDaysBeforeCheckIn: 1, refundPercent: 25 },
      ]),
    ).toEqual([
      { when: '7 days or more before check-in', refund: 'Full refund' },
      { when: '3 days or more before check-in', refund: '75% refund' },
      { when: '1 day or more before check-in', refund: '25% refund' },
      { when: 'Less than 1 day before check-in, or if you do not arrive', refund: 'No refund' },
    ]);
  });

  it('says "less than N days" using the smallest real tier, not a made-up number', () => {
    const rows = describeRefundRows([
      { minDaysBeforeCheckIn: 14, refundPercent: 100 },
      { minDaysBeforeCheckIn: 2, refundPercent: 50 },
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
    ]);

    expect(rows.at(-1)?.when).toBe('Less than 2 days before check-in, or if you do not arrive');
  });

  it('handles a ladder that only has a catch-all', () => {
    expect(describeRefundRows([{ minDaysBeforeCheckIn: 0, refundPercent: 100 }])).toEqual([
      { when: 'Any time before check-in', refund: 'Full refund' },
    ]);
  });

  it('shows no rows when the property has no ladder', () => {
    expect(describeRefundRows([])).toEqual([]);
  });

  it('does not change the order of the array it was given', () => {
    const tiers = [
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
      { minDaysBeforeCheckIn: 7, refundPercent: 100 },
    ];

    describeRefundRows(tiers);

    expect(tiers[0]?.minDaysBeforeCheckIn).toBe(0);
  });

  it('keeps a fractional percentage readable', () => {
    expect(describeRefundRows([{ minDaysBeforeCheckIn: 5, refundPercent: 12.5 }])[0]?.refund).toBe('12.5% refund');
  });
});

describe('describeRebooking', () => {
  const free = { rebookable: true, rebookFeeType: 'none' as const, rebookFeeValue: 0 };

  it('says dates cannot be changed and what to do instead', () => {
    const text = describeRebooking({ rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 }, 'EUR');

    expect(text).toContain('cannot be changed');
    expect(text).toContain('cancel');
    expect(text).toContain('book again');
  });

  it('allows free changes when there is no fee', () => {
    expect(describeRebooking(free, 'EUR')).toContain('at no charge');
  });

  it('shows a fixed fee in euros', () => {
    const text = describeRebooking({ rebookable: true, rebookFeeType: 'fixed', rebookFeeValue: 25 }, 'EUR');

    expect(text.replace(/\s/g, ' ')).toContain('fee of 25,00 €');
  });

  it('shows a percentage fee', () => {
    expect(describeRebooking({ rebookable: true, rebookFeeType: 'percent', rebookFeeValue: 10 }, 'EUR')).toContain(
      'fee of 10% of what you paid',
    );
  });

  it('treats a zero fee as free whatever the fee type says', () => {
    expect(describeRebooking({ rebookable: true, rebookFeeType: 'fixed', rebookFeeValue: 0 }, 'EUR')).toContain('at no charge');
    expect(describeRebooking({ rebookable: true, rebookFeeType: 'percent', rebookFeeValue: 0 }, 'EUR')).toContain('at no charge');
  });

  it('ignores a leftover fee when the dates cannot be changed anyway', () => {
    const text = describeRebooking({ rebookable: false, rebookFeeType: 'fixed', rebookFeeValue: 50 }, 'EUR');

    expect(text).not.toContain('50');
  });
});
