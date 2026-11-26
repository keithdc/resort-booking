/**
 * @file apps/admin/src/features/reporting/utils/report-insights.test.ts
 * @feature reporting
 */

import type { PeriodSummary } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { buildInsights } from './report-insights';

const PREVIOUS: PeriodSummary = {
  from: '2027-06-01', to: '2027-07-01', reservationCount: 2, occupiedNights: 8, occupancyPercent: 20,
  averageNightlyCents: 10000, grossRevenueCents: 100000, refundedCents: 0, netRevenueCents: 100000, cancelledCount: 0, cancellationRatePercent: 0, unpaidAtHotelCents: 0,
};

function report(overrides: Partial<Parameters<typeof buildInsights>[0]> = {}): Parameters<typeof buildInsights>[0] {
  return {
    netRevenueCents: 112000,
    previous: PREVIOUS,
    properties: [
      {
        propertyId: 'p1', propertyName: 'Alpine Lake', reservationCount: 4, occupiedNights: 10, revenueCents: 112000, currencyCode: 'EUR', houseCount: 2,
        houses: [
          { houseId: 'h1', houseName: 'Lake Chalet', reservationCount: 3, occupiedNights: 8, revenueCents: 70000 },
          { houseId: 'h2', houseName: 'Old Barn', reservationCount: 1, occupiedNights: 2, revenueCents: 42000 },
        ],
      },
    ],
    paymentMethods: [
      { paymentMethod: 'card', reservationCount: 3, revenueCents: 80000 },
      { paymentMethod: 'bank_transfer', reservationCount: 1, revenueCents: 32000 },
    ],
    occupiedNights: 10,
    availableNights: 60,
    occupancyPercent: 16.7,
    ...overrides,
  };
}

describe('buildInsights', () => {
  it('says how revenue moved, who earned most and how guests pay', () => {
    expect(buildInsights(report())).toEqual([
      'Revenue is 12% higher than the previous period.',
      'Lake Chalet earned 63% of revenue.',
      'Most guests pay by card (75%).',
    ]);
  });

  it('says lower when revenue fell', () => {
    expect(buildInsights(report({ netRevenueCents: 90000 }))[0]).toBe('Revenue is 10% lower than the previous period.');
  });

  it('says about the same when it barely moved', () => {
    expect(buildInsights(report({ netRevenueCents: 100200 }))[0]).toBe('Revenue is about the same as the previous period.');
  });

  it('leaves out the comparison when the earlier period had no revenue', () => {
    const sentences = buildInsights(report({ previous: { ...PREVIOUS, netRevenueCents: 0 } }));
    expect(sentences.some((sentence) => sentence.startsWith('Revenue is'))).toBe(false);
  });

  it('leaves out the top stay when there is only one stay or no revenue', () => {
    const one = report({ properties: [{ ...report().properties[0]!, houses: [report().properties[0]!.houses[0]!] }] });
    expect(buildInsights(one).some((sentence) => sentence.includes('earned'))).toBe(false);
    const none = report({ properties: [{ ...report().properties[0]!, houses: report().properties[0]!.houses.map((house) => ({ ...house, revenueCents: 0 })) }] });
    expect(buildInsights(none).some((sentence) => sentence.includes('earned'))).toBe(false);
  });

  it('only says most guests pay a way when it is a real majority of enough bookings', () => {
    const split = report({ paymentMethods: [{ paymentMethod: 'card', reservationCount: 2, revenueCents: 1 }, { paymentMethod: 'bank_transfer', reservationCount: 2, revenueCents: 1 }] });
    expect(buildInsights(split).some((sentence) => sentence.startsWith('Most guests'))).toBe(false);
    const few = report({ paymentMethods: [{ paymentMethod: 'card', reservationCount: 2, revenueCents: 1 }] });
    expect(buildInsights(few).some((sentence) => sentence.startsWith('Most guests'))).toBe(false);
  });

  it('names bank transfer when most guests use it', () => {
    const bank = report({ paymentMethods: [{ paymentMethod: 'bank_transfer', reservationCount: 4, revenueCents: 1 }, { paymentMethod: 'card', reservationCount: 1, revenueCents: 1 }] });
    expect(buildInsights(bank)).toContain('Most guests pay by bank transfer (80%).');
  });

  it('falls back to the occupancy fact and never returns more than three sentences', () => {
    const sparse = report({ previous: { ...PREVIOUS, netRevenueCents: 0 }, properties: [], paymentMethods: [] });
    expect(buildInsights(sparse)).toEqual(['10 of 60 nights were booked (16.7% occupancy).']);
    expect(buildInsights(report())).toHaveLength(3);
  });

  it('says nothing when there is nothing true to say', () => {
    expect(buildInsights(report({ previous: { ...PREVIOUS, netRevenueCents: 0 }, properties: [], paymentMethods: [], availableNights: 0, occupiedNights: 0, occupancyPercent: 0 }))).toEqual([]);
  });
});
