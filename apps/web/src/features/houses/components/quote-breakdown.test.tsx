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
    subtotalCents: 0,
    discounts: [],
    discountCents: 0,
    totalCents: 0,
    currencyCode: 'EUR',
    available: true,
    promoCode: null,
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

  it('shows each discount as its own line between the subtotal and the total', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          nights: 8,
          lines: [{ label: 'Standard rate', nights: 8, nightlyRateCents: 14000, subtotalCents: 112000 }],
          subtotalCents: 112000,
          discounts: [
            { discountId: 'a', label: 'Long stay: 7+ nights', amountCents: 11200 },
            { discountId: 'b', label: 'Welcome code', amountCents: 5000, percent: 15 },
          ],
          discountCents: 16200,
          totalCents: 95800,
        })}
      />,
    );

    const rows = text(screen.getByLabelText('Price breakdown').textContent);
    expect(rows).toContain('Subtotal1 120,00 €');
    expect(rows).toContain('Long stay: 7+ nights−112,00 €');
    expect(rows).toContain('Welcome code · 15% off−50,00 €');
    expect(rows).toContain('Total958,00 €');
  });

  it('puts the percent next to the name and says the discounts are combined when there are two', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          nights: 7,
          lines: [{ label: 'Standard rate', nights: 7, nightlyRateCents: 14000, subtotalCents: 98000 }],
          subtotalCents: 98000,
          discounts: [
            { discountId: 'a', label: 'Long stay: 7+ nights', amountCents: 9800, percent: 10 },
            { discountId: 'b', label: 'Welcome code', amountCents: 13230, percent: 15 },
          ],
          discountCents: 23030,
          totalCents: 74970,
        })}
      />,
    );

    const rows = text(screen.getByLabelText('Price breakdown').textContent);
    expect(rows).toContain('Long stay: 7+ nights · 10% off−98,00 €');
    expect(rows).toContain('Welcome code · 15% off−132,30 €');
    expect(rows).toContain('Your discounts are combined.');
    expect(rows).toContain('Total749,70 €');
  });

  it('does not say combined for a single discount', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          lines: [{ label: 'Standard rate', nights: 7, nightlyRateCents: 14000, subtotalCents: 98000 }],
          subtotalCents: 98000,
          discounts: [{ discountId: 'a', label: 'Long stay: 7+ nights', amountCents: 9800, percent: 10 }],
          discountCents: 9800,
          totalCents: 88200,
        })}
      />,
    );

    expect(text(screen.getByLabelText('Price breakdown').textContent)).not.toContain('combined');
  });

  it('hides the subtotal row when there is no discount', () => {
    render(
      <QuoteBreakdown
        quote={quote({
          lines: [{ label: 'Standard rate', nights: 1, nightlyRateCents: 18000, subtotalCents: 18000 }],
          subtotalCents: 18000,
          totalCents: 18000,
        })}
      />,
    );

    expect(text(screen.getByLabelText('Price breakdown').textContent)).not.toContain('Subtotal');
  });
});
