/**
 * @file apps/web/src/shared/utils/cancellation-policy.test.ts
 * @shared Cancellation policy wording
 */

import { describe, expect, it } from 'vitest';
import { buildRefundSegments, describeRebooking, describeRefundHeadline } from './cancellation-policy';

const SAMPLE = [
  { minDaysBeforeCheckIn: 0, refundPercent: 0 },
  { minDaysBeforeCheckIn: 7, refundPercent: 100 },
  { minDaysBeforeCheckIn: 3, refundPercent: 75 },
  { minDaysBeforeCheckIn: 1, refundPercent: 25 },
];

describe('describeRefundHeadline', () => {
  it('says full refund until N days before when the top tier is 100%', () => {
    expect(describeRefundHeadline(SAMPLE)).toBe('Full refund until 7 days before check-in');
  });

  it('uses the singular for one day', () => {
    expect(describeRefundHeadline([{ minDaysBeforeCheckIn: 1, refundPercent: 100 }, { minDaysBeforeCheckIn: 0, refundPercent: 0 }])).toBe(
      'Full refund until 1 day before check-in',
    );
  });

  it('picks the latest deadline that still gives everything back', () => {
    expect(
      describeRefundHeadline([
        { minDaysBeforeCheckIn: 14, refundPercent: 100 },
        { minDaysBeforeCheckIn: 5, refundPercent: 100 },
        { minDaysBeforeCheckIn: 0, refundPercent: 0 },
      ]),
    ).toBe('Full refund until 5 days before check-in');
  });

  it('turns the days into a date when the check-in is known', () => {
    expect(describeRefundHeadline(SAMPLE, '2026-12-10')).toBe('Full refund until 3 Dec 2026');
  });

  it('crosses a month and a year boundary', () => {
    expect(describeRefundHeadline(SAMPLE, '2027-01-03')).toBe('Full refund until 27 Dec 2026');
  });

  it('falls back to days when the check-in is not a real date', () => {
    expect(describeRefundHeadline(SAMPLE, '2026-02-31')).toBe('Full refund until 7 days before check-in');
  });

  it('says "up to" when no tier gives everything back', () => {
    expect(
      describeRefundHeadline([
        { minDaysBeforeCheckIn: 7, refundPercent: 50 },
        { minDaysBeforeCheckIn: 2, refundPercent: 25 },
        { minDaysBeforeCheckIn: 0, refundPercent: 0 },
      ]),
    ).toBe('Refund of up to 50% until 7 days before check-in');
  });

  it('adds the date to the "up to" headline', () => {
    expect(describeRefundHeadline([{ minDaysBeforeCheckIn: 7, refundPercent: 50 }], '2026-12-10')).toBe(
      'Refund of up to 50% until 3 Dec 2026',
    );
  });

  it('uses the catch-all wording when that is all there is', () => {
    expect(describeRefundHeadline([{ minDaysBeforeCheckIn: 0, refundPercent: 100 }])).toBe('Full refund until check-in');
    expect(describeRefundHeadline([{ minDaysBeforeCheckIn: 0, refundPercent: 40 }])).toBe('40% refund until check-in');
    expect(describeRefundHeadline([{ minDaysBeforeCheckIn: 0, refundPercent: 100 }], '2026-12-10')).toBe(
      'Full refund until check-in on 10 Dec 2026',
    );
  });

  it('says there is no refund when every tier is 0%', () => {
    expect(describeRefundHeadline([{ minDaysBeforeCheckIn: 7, refundPercent: 0 }, { minDaysBeforeCheckIn: 0, refundPercent: 0 }])).toBe(
      'No refund when cancelling',
    );
  });

  it('handles the default ladder of a new property (one catch-all row, 0 days, 0%): no refund, with and without a date', () => {
    const only = [{ minDaysBeforeCheckIn: 0, refundPercent: 0 }];

    expect(describeRefundHeadline(only)).toBe('No refund when cancelling');
    expect(describeRefundHeadline(only, '2026-12-10')).toBe('No refund when cancelling');
    expect(buildRefundSegments(only).map((segment) => [segment.period, segment.refund, segment.percent, segment.tone])).toEqual([
      ['Any time before check-in', 'No refund', 0, 'error'],
    ]);
  });

  it('returns null for an empty ladder', () => {
    expect(describeRefundHeadline([])).toBeNull();
  });

  it('does not reorder the array it was given', () => {
    const tiers = [...SAMPLE];

    describeRefundHeadline(tiers);

    expect(tiers).toEqual(SAMPLE);
  });
});

describe('buildRefundSegments', () => {
  it('turns tiers 7, 3, 1, 0 into 7+, 3-6, 1-2, <1, earliest first', () => {
    const segments = buildRefundSegments(SAMPLE);

    expect(segments.map((segment) => [segment.period, segment.refund, segment.percent, segment.tone])).toEqual([
      ['7 or more days before', 'Full refund', 100, 'success'],
      ['3 to 6 days before', '75% refund', 75, 'warning'],
      ['1 to 2 days before', '25% refund', 25, 'warning'],
      ['Less than 1 day, or no-show', 'No refund', 0, 'error'],
    ]);
    expect(segments.every((segment) => segment.window === null)).toBe(true);
  });

  it('says a single day when two tiers are next to each other', () => {
    const segments = buildRefundSegments([
      { minDaysBeforeCheckIn: 3, refundPercent: 100 },
      { minDaysBeforeCheckIn: 2, refundPercent: 50 },
      { minDaysBeforeCheckIn: 1, refundPercent: 10 },
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
    ]);

    expect(segments.map((segment) => segment.period)).toEqual([
      '3 or more days before',
      '2 days before',
      '1 day before',
      'Less than 1 day, or no-show',
    ]);
  });

  it('uses the smallest real tier for the catch-all, not a made-up number', () => {
    const segments = buildRefundSegments([
      { minDaysBeforeCheckIn: 14, refundPercent: 100 },
      { minDaysBeforeCheckIn: 2, refundPercent: 50 },
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
    ]);

    expect(segments.map((segment) => segment.period)).toEqual([
      '14 or more days before',
      '2 to 13 days before',
      'Less than 2 days, or no-show',
    ]);
  });

  it('handles a ladder that only has a catch-all', () => {
    const [only] = buildRefundSegments([{ minDaysBeforeCheckIn: 0, refundPercent: 100 }]);

    expect(only?.period).toBe('Any time before check-in');
    expect(only?.tone).toBe('success');
  });

  it('has no segments for an empty ladder', () => {
    expect(buildRefundSegments([])).toEqual([]);
  });

  it('colours a fractional percentage as partial and keeps it readable', () => {
    const [only] = buildRefundSegments([{ minDaysBeforeCheckIn: 5, refundPercent: 12.5 }]);

    expect(only?.refund).toBe('12.5% refund');
    expect(only?.tone).toBe('warning');
  });

  it('gives each segment its date window when the check-in is known', () => {
    const segments = buildRefundSegments(SAMPLE, '2026-12-10');

    expect(segments.map((segment) => segment.window)).toEqual([
      'Until 3 Dec 2026',
      '3 Dec 2026 to 7 Dec 2026',
      '7 Dec 2026 to 9 Dec 2026',
      'From 9 Dec 2026',
    ]);
  });

  it('crosses a year boundary in the windows', () => {
    const windows = buildRefundSegments(SAMPLE, '2027-01-03').map((segment) => segment.window);

    expect(windows[0]).toBe('Until 27 Dec 2026');
    expect(windows[3]).toBe('From 2 Jan 2027');
  });

  it('shows the check-in day for a catch-all-only ladder', () => {
    expect(buildRefundSegments([{ minDaysBeforeCheckIn: 0, refundPercent: 100 }], '2026-12-10')[0]?.window).toBe('Until 10 Dec 2026');
  });

  it('ignores a check-in that is not a real date', () => {
    expect(buildRefundSegments(SAMPLE, 'soon').every((segment) => segment.window === null)).toBe(true);
  });

  it('does not change the order of the array it was given', () => {
    const tiers = [
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
      { minDaysBeforeCheckIn: 7, refundPercent: 100 },
    ];

    buildRefundSegments(tiers);

    expect(tiers[0]?.minDaysBeforeCheckIn).toBe(0);
  });
});

describe('describeRebooking', () => {
  const free = { rebookable: true, rebookFeeType: 'none' as const, rebookFeeValue: 0 };

  it('says dates cannot be changed and what to do instead', () => {
    const text = describeRebooking({ rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 }, 'EUR');

    expect(text).toBe('Dates cannot be changed after booking. You can cancel (the refund above applies) and book again.');
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
