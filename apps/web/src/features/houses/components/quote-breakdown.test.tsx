// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/quote-breakdown.test.tsx
 * @feature houses
 */

import type { Quote } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuoteBreakdown } from './quote-breakdown';

function quote(overrides: Partial<Quote>): Quote {
  return {
    houseId: 'h',
    checkIn: '2027-06-29',
    checkOut: '2027-07-03',
    guestCount: 2,
    nights: 4,
    nightlyRateCents: 18000,
    lines: [],
    totalCents: 0,
    currencyCode: 'EUR',
    available: true,
    ...overrides,
  };
}

// Intl uses a narrow no-break space between digits and the symbol; match loosely.
function text(content: string | undefined | null): string {
  return (content ?? '').replace(/\s/g, ' ');
}

describe('QuoteBreakdown', () => {
  afterEach(cleanup);

  it('shows one line per rate with its season name when the stay crosses seasons', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          lines: [
            { label: 'Standard rate', nights: 2, nightlyRateCents: 18000, subtotalCents: 36000 },
            { label: 'Peak summer', nights: 2, nightlyRateCents: 30000, subtotalCents: 60000 },
          ],
          totalCents: 96000,
        })}
      />,
    );

    const rows = screen.getByLabelText('Price breakdown').textContent;
    expect(text(rows)).toContain('2 nights × 180,00 € · Standard rate');
    expect(text(rows)).toContain('2 nights × 300,00 € · Peak summer');
    expect(text(rows)).toContain('960,00 €');
  });

  it('keeps a plain standard-rate stay simple, without a season label', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          nights: 3,
          lines: [{ label: 'Standard rate', nights: 3, nightlyRateCents: 18000, subtotalCents: 54000 }],
          totalCents: 54000,
        })}
      />,
    );

    const rows = text(screen.getByLabelText('Price breakdown').textContent);
    expect(rows).toContain('3 nights × 180,00 €');
    expect(rows).not.toContain('Standard rate');
  });

  it('names the season when the whole stay sits inside one period', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          nights: 1,
          lines: [{ label: 'Peak summer', nights: 1, nightlyRateCents: 30000, subtotalCents: 30000 }],
          totalCents: 30000,
        })}
      />,
    );

    expect(text(screen.getByLabelText('Price breakdown').textContent)).toContain('1 night × 300,00 € · Peak summer');
  });

  it('shows the total the API sent, not one it worked out', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          lines: [{ label: 'Standard rate', nights: 1, nightlyRateCents: 100, subtotalCents: 100 }],
          totalCents: 12345,
        })}
      />,
    );

    expect(text(screen.getByLabelText('Price breakdown').textContent)).toContain('123,45 €');
  });
});
