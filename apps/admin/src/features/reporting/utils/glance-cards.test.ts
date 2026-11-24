/**
 * @file apps/admin/src/features/reporting/utils/glance-cards.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { periodSummary, staffReport } from '@/test/fixtures';
import { buildGlanceCards } from './glance-cards';

describe('buildGlanceCards', () => {
  it('has exactly four cards in the owner order', () => {
    expect(buildGlanceCards(staffReport()).map((card) => card.key)).toEqual(['revenue', 'bookings', 'occupancy', 'averageNightlyRate']);
  });

  it('shows revenue after refunds with the gross and refunded money underneath', () => {
    const [revenue] = buildGlanceCards(staffReport());

    expect(revenue?.value).toContain('1');
    expect(revenue?.value).toContain('560');
    expect(revenue?.secondary).toContain('Paid by guests');
    expect(revenue?.secondary).toContain('Refunded');
    expect(revenue?.explanation).toMatch(/minus refunds/);
  });

  it('compares each card with the period before', () => {
    const cards = buildGlanceCards(staffReport({ netRevenueCents: 112000, reservationCount: 4, previous: periodSummary({ netRevenueCents: 100000, reservationCount: 2, occupancyPercent: 5, averageNightlyCents: 20000 }), occupancyPercent: 8, averageNightlyCents: 10000 }));

    expect(cards[0]?.change.short).toBe('▲ 12%');
    expect(cards[1]?.change.short).toBe('▲ 100%');
    expect(cards[2]?.change.short).toBe('▲ 3 points');
    expect(cards[3]?.change.short).toBe('▼ 50%');
  });

  it('says there is no earlier data when the period before had nothing', () => {
    const cards = buildGlanceCards(staffReport({ previous: periodSummary({ reservationCount: 0, netRevenueCents: 0, occupancyPercent: 0, averageNightlyCents: 0 }) }));

    expect(cards.map((card) => card.change.direction)).toEqual(['none', 'none', 'none', 'none']);
  });

  it('describes occupancy in nights, and shows zeros without bookings', () => {
    const cards = buildGlanceCards(staffReport({ reservationCount: 0, occupiedNights: 0, availableNights: 31, occupancyPercent: 0, netRevenueCents: 0, grossRevenueCents: 0, refundedCents: 0, averageNightlyCents: 0 }));

    expect(cards[2]?.explanation).toBe('0 of 31 available nights were booked.');
    expect(cards[1]?.value).toBe('0');
    expect(cards[2]?.value).toBe('0%');
  });
});
