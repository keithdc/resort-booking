// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/sticky-reserve-bar.test.tsx
 * @feature houses
 */

import type { Quote } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StayQuoteProvider, usePublishStayQuote } from '../context/stay-quote-context';
import { BOOKING_PANEL_ID, StickyReserveBar } from './sticky-reserve-bar';

const QUOTE: Quote = {
  houseId: 'h1',
  checkIn: '2027-06-10',
  checkOut: '2027-06-13',
  guestCount: 2,
  nights: 3,
  nightlyRateCents: 32000,
  discountCents: 0,
  available: true,
  currencyCode: 'EUR',
  lines: [{ label: 'Standard rate', nights: 3, nightlyRateCents: 32000, subtotalCents: 96000 }],
  subtotalCents: 96000,
  discounts: [],
  totalCents: 96000,
  promoCode: null,
};

function Publisher({ quote }: { quote: Quote | null }): null {
  usePublishStayQuote(quote);
  return null;
}

function renderBar(quote: Quote | null): void {
  render(
    <StayQuoteProvider>
      <Publisher quote={quote} />
      <div id={BOOKING_PANEL_ID} />
      <StickyReserveBar standardRateCents={32000} currencyCode="EUR" />
    </StayQuoteProvider>,
  );
}

describe('StickyReserveBar', () => {
  afterEach(cleanup);

  it('shows the standard rate and "Check dates" before any dates are priced', () => {
    renderBar(null);

    const bar = screen.getByRole('complementary', { name: 'Reserve this stay' });
    expect(bar.textContent).toContain('320,00');
    expect(bar.textContent).toContain('Add dates to see the total');
    expect(screen.getByRole('button', { name: 'Check dates' })).toBeTruthy();
  });

  it('shows the API total and the number of nights once the checkout has a quote', () => {
    renderBar(QUOTE);

    const bar = screen.getByRole('complementary', { name: 'Reserve this stay' });
    expect(bar.textContent).toContain('960,00');
    expect(bar.textContent).toContain('3 nights');
    expect(screen.getByRole('button', { name: 'Reserve' })).toBeTruthy();
  });

  it('says so when the dates are not available', () => {
    renderBar({ ...QUOTE, available: false });

    expect(screen.getByRole('complementary').textContent).toContain('Dates not available');
  });

  it('scrolls to the booking panel when pressed', async () => {
    const scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    function Panel(): React.JSX.Element {
      useEffect((): void => {
        const panel = document.getElementById(BOOKING_PANEL_ID);
        if (panel !== null) {
          panel.scrollIntoView = scrollIntoView;
        }
      }, []);
      return <div id={BOOKING_PANEL_ID} />;
    }
    render(
      <StayQuoteProvider>
        <Panel />
        <StickyReserveBar standardRateCents={32000} currencyCode="EUR" />
      </StayQuoteProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Check dates' }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
