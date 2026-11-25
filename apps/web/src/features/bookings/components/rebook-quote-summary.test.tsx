// @vitest-environment jsdom
/**
 * @file apps/web/src/features/bookings/components/rebook-quote-summary.test.tsx
 * @feature bookings
 */

import type { RebookQuote } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RebookQuoteSummary } from './rebook-quote-summary';

function quote(overrides: Partial<RebookQuote> = {}): RebookQuote {
  return {
    reference: 'BK-ABC1234567',
    newCheckIn: '2027-08-01',
    newCheckOut: '2027-08-04',
    nights: 3,
    currencyCode: 'EUR',
    lines: [{ label: 'Peak summer 2027', nights: 3, nightlyRateCents: 41600, subtotalCents: 124800 }],
    subtotalCents: 124800,
    discounts: [],
    discountCents: 0,
    newTotalCents: 124800,
    feeCents: 0,
    paidCents: 96000,
    balanceCents: 28800,
    payCents: 28800,
    refundCents: 0,
    available: true,
    problem: null,
    promoCode: null,
    ...overrides,
  };
}

function text(): string {
  return (screen.getByLabelText('Price of the new dates').textContent ?? '').replace(/\s/g, ' ');
}

describe('RebookQuoteSummary', () => {
  afterEach(cleanup);

  it('shows the new dates, the nights by rate, the new total and what was already paid', () => {
    render(<RebookQuoteSummary quote={quote()} />);

    expect(text()).toContain('2027-08-01 to 2027-08-04 · 3 nights');
    expect(text()).toContain('3 nights × 416,00 € · Peak summer 2027');
    expect(text()).toContain('New total1 248,00 €');
    expect(text()).toContain('Already paid960,00 €');
  });

  it('says in one sentence that the guest pays more', () => {
    render(<RebookQuoteSummary quote={quote()} />);

    expect(text()).toContain('You pay 288,00 € more');
  });

  it('says the guest gets money back when the new dates cost less', () => {
    render(<RebookQuoteSummary quote={quote({ newTotalCents: 80000, payCents: 0, refundCents: 16000, balanceCents: -16000 })} />);

    expect(text()).toContain('You get 160,00 € back');
  });

  it('says nothing is owed when it comes out even', () => {
    render(<RebookQuoteSummary quote={quote({ newTotalCents: 96000, payCents: 0, refundCents: 0, balanceCents: 0 })} />);

    expect(text()).toContain('Nothing more to pay and nothing to refund');
  });

  it('shows the change fee only when there is one', () => {
    const { unmount } = render(<RebookQuoteSummary quote={quote({ feeCents: 2000, payCents: 30800, balanceCents: 30800 })} />);
    expect(text()).toContain('Change fee20,00 €');
    unmount();

    render(<RebookQuoteSummary quote={quote()} />);
    expect(text()).not.toContain('Change fee');
  });

  it('shows each discount as its own negative line', () => {
    render(
      <RebookQuoteSummary
        quote={quote({ discounts: [{ discountId: 'd', label: 'Long stay', amountCents: 12480 }], discountCents: 12480, newTotalCents: 112320 })}
      />,
    );

    expect(text()).toContain('Long stay−124,80 €');
  });

  it('shows the percent next to a percentage discount and notes two discounts are combined', () => {
    render(
      <RebookQuoteSummary
        quote={quote({
          discounts: [
            { discountId: 'a', label: 'Long stay', amountCents: 9800, percent: 10 },
            { discountId: 'b', label: 'Welcome code', amountCents: 13230, percent: 15 },
          ],
          discountCents: 23030,
        })}
      />,
    );

    expect(text()).toContain('Long stay · 10% off−98,00 €');
    expect(text()).toContain('Welcome code · 15% off−132,30 €');
    expect(text()).toContain('Your discounts are combined.');
  });

  it('shows why the dates cannot be used', () => {
    render(<RebookQuoteSummary quote={quote({ available: false, problem: 'Those dates are not available for this stay.' })} />);

    expect(text()).toContain('Those dates are not available for this stay.');
  });

  it('uses the singular for one night', () => {
    render(<RebookQuoteSummary quote={quote({ nights: 1, lines: [{ label: 'Standard rate', nights: 1, nightlyRateCents: 20000, subtotalCents: 20000 }] })} />);

    expect(text()).toContain('1 night');
    expect(text()).toContain('1 night × 200,00 €');
  });
});
