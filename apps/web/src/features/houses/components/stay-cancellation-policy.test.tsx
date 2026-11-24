// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/stay-cancellation-policy.test.tsx
 * @feature houses
 */

import type { CancellationPolicy, Quote } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StayQuoteProvider, usePublishStayQuote } from '../context/stay-quote-context';
import { StayCancellationPolicy } from './stay-cancellation-policy';

const POLICY: CancellationPolicy = {
  propertyId: 'p',
  tiers: [
    { minDaysBeforeCheckIn: 7, refundPercent: 100 },
    { minDaysBeforeCheckIn: 0, refundPercent: 0 },
  ],
  rebookable: false,
  rebookFeeType: 'none',
  rebookFeeValue: 0,
};

function quote(checkIn: string): Quote {
  return {
    houseId: 'h',
    checkIn,
    checkOut: '2026-12-12',
    guestCount: 2,
    nights: 2,
    nightlyRateCents: 10_000,
    lines: [],
    subtotalCents: 20_000,
    discounts: [],
    discountCents: 0,
    totalCents: 20_000,
    currencyCode: 'EUR',
    available: true,
    promoCode: null,
  };
}

function Publisher({ value }: { value: Quote | null }): null {
  usePublishStayQuote(value);
  return null;
}

describe('StayCancellationPolicy', () => {
  afterEach(cleanup);

  it('shows the generic ladder when the checkout has no quote', () => {
    render(
      <StayQuoteProvider>
        <StayCancellationPolicy policy={POLICY} currencyCode="EUR" />
      </StayQuoteProvider>,
    );

    expect(screen.getByText('Full refund until 7 days before check-in')).toBeTruthy();
  });

  it('shows the generic ladder without any provider', () => {
    render(<StayCancellationPolicy policy={POLICY} currencyCode="EUR" />);

    expect(screen.getByText('Full refund until 7 days before check-in')).toBeTruthy();
  });

  it('shows real deadlines once the checkout publishes a quote', () => {
    render(
      <StayQuoteProvider>
        <Publisher value={quote('2026-12-10')} />
        <StayCancellationPolicy policy={POLICY} currencyCode="EUR" />
      </StayQuoteProvider>,
    );

    expect(screen.getByText('Full refund until 3 Dec 2026')).toBeTruthy();
  });
});
