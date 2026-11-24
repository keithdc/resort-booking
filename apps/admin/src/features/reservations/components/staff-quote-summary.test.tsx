// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/staff-quote-summary.test.tsx
 * @feature reservations
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { rebookQuote } from '@/test/fixtures';
import { StaffQuoteSummary } from './staff-quote-summary';

function text(): string {
  return (screen.getByLabelText('Price of the new dates').textContent ?? '').replace(/\s/g, ' ');
}

describe('StaffQuoteSummary', () => {
  afterEach(cleanup);

  it('shows the new dates, nights by rate, the new total, the fee and what was already paid', () => {
    render(<StaffQuoteSummary quote={rebookQuote()} />);

    expect(text()).toContain('2027-07-20 to 2027-07-23 · 3 nights');
    expect(text()).toContain('3 nights × 416,00 € · Standard rate');
    expect(text()).toContain('New total1 248,00 €');
    expect(text()).toContain('Change fee20,00 €');
    expect(text()).toContain('Already paid960,00 €');
  });

  it('says what the guest owes, gets back, or nothing', () => {
    const { unmount } = render(<StaffQuoteSummary quote={rebookQuote()} />);
    expect(text()).toContain('The guest owes 308,00 € more');
    unmount();

    const refund = render(<StaffQuoteSummary quote={rebookQuote({ payCents: 0, refundCents: 12000, balanceCents: -12000 })} />);
    expect(text()).toContain('The guest gets 120,00 € back');
    refund.unmount();

    render(<StaffQuoteSummary quote={rebookQuote({ payCents: 0, refundCents: 0, balanceCents: 0 })} />);
    expect(text()).toContain('Nothing more to pay and nothing to refund');
  });

  it('shows a waived fee as zero', () => {
    render(<StaffQuoteSummary quote={rebookQuote({ feeCents: 0, payCents: 28800, balanceCents: 28800 })} />);

    expect(text()).toContain('Change fee0,00 €');
  });

  it('shows each discount as its own negative line', () => {
    render(<StaffQuoteSummary quote={rebookQuote({ discounts: [{ discountId: 'd', label: 'Long booking', amountCents: 12480 }] })} />);

    expect(text()).toContain('Long booking−124,80 €');
  });

  it('shows why the new dates cannot be used', () => {
    render(<StaffQuoteSummary quote={rebookQuote({ available: false, problem: 'Those dates are not available for this stay.' })} />);

    expect(text()).toContain('Those dates are not available for this stay.');
  });

  it('uses the singular for one night', () => {
    render(<StaffQuoteSummary quote={rebookQuote({ nights: 1, lines: [{ label: 'Standard rate', nights: 1, nightlyRateCents: 20000, subtotalCents: 20000 }] })} />);

    expect(text()).toContain('· 1 night');
    expect(text()).toContain('1 night × 200,00 €');
  });
});
