/**
 * @file apps/web/src/features/houses/utils/nightly-rate-label.test.ts
 * @feature houses
 */

import type { QuoteLine } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { nightlyRateParts } from './nightly-rate-label';

const STANDARD = { nightlyRateCents: 32000, currencyCode: 'EUR' };
const plain = (text: string): string => text.replace(/\s/g, ' ');

function line(label: string, nights: number, nightlyRateCents: number): QuoteLine {
  return { label, nights, nightlyRateCents, subtotalCents: nights * nightlyRateCents };
}

function quote(lines: QuoteLine[], available = true): { lines: QuoteLine[]; available: boolean; currencyCode: string } {
  return { lines, available, currencyCode: 'EUR' };
}

describe('nightlyRateParts', () => {
  it('shows the standard rate before any quote exists, exactly as the page always did', () => {
    const parts = nightlyRateParts(null, STANDARD);

    expect(parts.lead).toBe('Standard rate');
    expect(plain(parts.rate)).toBe('320,00 € / night');
    expect(parts.season).toBeNull();
  });

  it('shows the standard rate for dates entirely at the standard rate', () => {
    const parts = nightlyRateParts(quote([line('Standard rate', 3, 32000)]), STANDARD);

    expect(parts.lead).toBe('Standard rate');
    expect(plain(parts.rate)).toBe('320,00 € / night');
    expect(parts.season).toBeNull();
  });

  it('shows the seasonal rate and its name when every night is in one season', () => {
    const parts = nightlyRateParts(quote([line('Peak summer 2027', 3, 41600)]), STANDARD);

    expect(parts.lead).toBe('');
    expect(plain(parts.rate)).toBe('416,00 € / night');
    expect(parts.season).toBe('Peak summer 2027');
  });

  it('shows the lowest to the highest rate when the stay crosses seasons', () => {
    const parts = nightlyRateParts(quote([line('Standard rate', 2, 32000), line('Peak summer 2027', 2, 41600)]), STANDARD);

    expect(plain(parts.rate)).toBe('320,00 € – 416,00 € / night');
    expect(parts.lead).toBe('');
    expect(parts.season).toBeNull();
  });

  it('orders a range by value, not by the order of the lines', () => {
    const parts = nightlyRateParts(quote([line('Peak summer 2027', 1, 41600), line('Standard rate', 1, 32000)]), STANDARD);

    expect(plain(parts.rate)).toBe('320,00 € – 416,00 € / night');
  });

  it('handles a single night', () => {
    const parts = nightlyRateParts(quote([line('Winter holidays', 1, 44800)]), STANDARD);

    expect(plain(parts.rate)).toBe('448,00 € / night');
    expect(parts.season).toBe('Winter holidays');
  });

  it('collapses two seasons that happen to share one rate into one rate with no single name', () => {
    const parts = nightlyRateParts(quote([line('Peak A', 1, 41600), line('Peak B', 1, 41600)]), STANDARD);

    expect(plain(parts.rate)).toBe('416,00 € / night');
    expect(parts.season).toBeNull();
  });

  it('falls back to the standard rate when the dates are not available or nothing was priced', () => {
    expect(plain(nightlyRateParts(quote([line('Peak summer 2027', 3, 41600)], false), STANDARD).rate)).toBe('320,00 € / night');
    expect(nightlyRateParts(quote([line('Peak summer 2027', 3, 41600)], false), STANDARD).lead).toBe('Standard rate');
    expect(plain(nightlyRateParts(quote([]), STANDARD).rate)).toBe('320,00 € / night');
  });

  it('shows a free season as a real rate, not as missing', () => {
    const parts = nightlyRateParts(quote([line('Owner stay', 2, 0)]), STANDARD);

    expect(plain(parts.rate)).toBe('0,00 € / night');
    expect(parts.season).toBe('Owner stay');
  });
});
