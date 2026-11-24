// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/listing-highlights.test.tsx
 * @feature houses
 */

import type { Quote, QuoteLine } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StayQuoteProvider, usePublishStayQuote } from '../context/stay-quote-context';
import { ListingHighlights } from './listing-highlights';

function line(label: string, nights: number, nightlyRateCents: number): QuoteLine {
  return { label, nights, nightlyRateCents, subtotalCents: nights * nightlyRateCents };
}

function quote(lines: QuoteLine[], available = true): Quote {
  return {
    houseId: 'h',
    checkIn: '2027-07-10',
    checkOut: '2027-07-12',
    guestCount: 2,
    nights: 2,
    nightlyRateCents: 32000,
    lines,
    subtotalCents: 0,
    discounts: [],
    discountCents: 0,
    totalCents: 0,
    currencyCode: 'EUR',
    available,
    promoCode: null,
  };
}

function Publisher({ value }: { value: Quote | null }): null {
  usePublishStayQuote(value);
  return null;
}

function header(): string {
  return (screen.getByText(/Stay in/).textContent ?? '').replace(/\s/g, ' ');
}

function renderHeader(value: Quote | null | undefined): void {
  render(
    <StayQuoteProvider>
      <ListingHighlights city="Annecy" sleeps={8} standardRateCents={32000} currencyCode="EUR" />
      {value === undefined ? null : <Publisher value={value} />}
    </StayQuoteProvider>,
  );
}

describe('ListingHighlights', () => {
  afterEach(cleanup);

  it('shows the standard rate on first render, before any dates are priced', () => {
    renderHeader(undefined);

    expect(header()).toContain('Stay in Annecy · Sleeps 8 guests · Standard rate 320,00 € / night');
  });

  it('shows the seasonal rate and its name once dates in a season are priced', () => {
    renderHeader(quote([line('Peak summer 2027', 3, 41600)]));

    expect(header()).toContain('Sleeps 8 guests · 416,00 € / night · Peak summer 2027');
    expect(header()).not.toContain('Standard rate');
  });

  it('shows a range when the dates cross seasons', () => {
    renderHeader(quote([line('Standard rate', 2, 32000), line('Peak summer 2027', 2, 41600)]));

    expect(header()).toContain('320,00 € – 416,00 € / night');
  });

  it('keeps the standard wording for dates at the standard rate', () => {
    renderHeader(quote([line('Standard rate', 2, 32000)]));

    expect(header()).toContain('Standard rate 320,00 € / night');
  });

  it('goes back to the standard rate when the dates are not available', () => {
    renderHeader(quote([line('Peak summer 2027', 3, 41600)], false));

    expect(header()).toContain('Standard rate 320,00 € / night');
  });

  it('goes back to the standard rate when the quote is cleared', () => {
    const { rerender } = render(
      <StayQuoteProvider>
        <ListingHighlights city="Annecy" sleeps={8} standardRateCents={32000} currencyCode="EUR" />
        <Publisher value={quote([line('Peak summer 2027', 3, 41600)])} />
      </StayQuoteProvider>,
    );
    expect(header()).toContain('Peak summer 2027');

    rerender(
      <StayQuoteProvider>
        <ListingHighlights city="Annecy" sleeps={8} standardRateCents={32000} currencyCode="EUR" />
        <Publisher value={null} />
      </StayQuoteProvider>,
    );

    expect(header()).toContain('Standard rate 320,00 € / night');
  });

  it('works with no provider around it (the plain standard rate)', () => {
    render(<ListingHighlights city="Annecy" sleeps={8} standardRateCents={32000} currencyCode="EUR" />);

    expect(header()).toContain('Standard rate 320,00 € / night');
  });
});
