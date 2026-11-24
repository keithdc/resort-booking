// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/context/stay-quote-context.test.tsx
 * @feature houses
 */

import type { Quote } from '@resort-booking/shared-types';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StayQuoteProvider, usePublishStayQuote, useStayQuote } from './stay-quote-context';

function quote(totalCents: number): Quote {
  return {
    houseId: 'h',
    checkIn: '2027-07-10',
    checkOut: '2027-07-12',
    guestCount: 2,
    nights: 2,
    nightlyRateCents: 10000,
    lines: [],
    subtotalCents: totalCents,
    discounts: [],
    discountCents: 0,
    totalCents,
    currencyCode: 'EUR',
    available: true,
    promoCode: null,
  };
}

function Reader(): React.JSX.Element {
  const current = useStayQuote();
  return <p aria-label="reader">{current === null ? 'none' : String(current.totalCents)}</p>;
}

function Publisher({ value }: { value: Quote | null }): null {
  usePublishStayQuote(value);
  return null;
}

describe('stay quote context', () => {
  afterEach(cleanup);

  it('has no quote until the checkout publishes one', () => {
    render(
      <StayQuoteProvider>
        <Reader />
      </StayQuoteProvider>,
    );

    expect(screen.getByLabelText('reader').textContent).toBe('none');
  });

  it('shares the published quote with the reader', () => {
    render(
      <StayQuoteProvider>
        <Reader />
        <Publisher value={quote(20000)} />
      </StayQuoteProvider>,
    );

    expect(screen.getByLabelText('reader').textContent).toBe('20000');
  });

  it('follows the checkout when it publishes a new quote', () => {
    const { rerender } = render(
      <StayQuoteProvider>
        <Reader />
        <Publisher value={quote(20000)} />
      </StayQuoteProvider>,
    );

    rerender(
      <StayQuoteProvider>
        <Reader />
        <Publisher value={quote(30000)} />
      </StayQuoteProvider>,
    );

    expect(screen.getByLabelText('reader').textContent).toBe('30000');
  });

  it('clears when the checkout publishes null', () => {
    const { rerender } = render(
      <StayQuoteProvider>
        <Reader />
        <Publisher value={quote(20000)} />
      </StayQuoteProvider>,
    );

    rerender(
      <StayQuoteProvider>
        <Reader />
        <Publisher value={null} />
      </StayQuoteProvider>,
    );

    expect(screen.getByLabelText('reader').textContent).toBe('none');
  });

  it('clears when the checkout unmounts, so the header never keeps a stale price', () => {
    const { rerender } = render(
      <StayQuoteProvider>
        <Reader />
        <Publisher value={quote(20000)} />
      </StayQuoteProvider>,
    );

    rerender(
      <StayQuoteProvider>
        <Reader />
      </StayQuoteProvider>,
    );

    expect(screen.getByLabelText('reader').textContent).toBe('none');
  });

  it('works without a provider: reading gives null and publishing does nothing', () => {
    const { result } = renderHook(() => useStayQuote());
    expect(result.current).toBeNull();

    expect(() => render(<Publisher value={quote(1)} />)).not.toThrow();
  });
});
