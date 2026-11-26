// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/payments-tab.test.tsx
 * @feature reporting
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { staffReport } from '@/test/fixtures';
import { MoneyVisibility } from './money-visibility';
import { PaymentsTab } from './payments-tab';

describe('PaymentsTab', () => {
  afterEach(cleanup);

  it('shows how guests paid with counts, money and share, under a captioned heading', () => {
    render(<PaymentsTab report={staffReport()} />);

    expect(screen.getByRole('heading', { name: 'How guests paid' })).toBeTruthy();
    expect(screen.getByText(/Confirmed bookings split by card or wallet/)).toBeTruthy();
    expect(screen.getByText('Card / wallets')).toBeTruthy();
    expect(screen.getByText(/2 bookings/)).toBeTruthy();
    expect(screen.getByText(/1 booking ·/)).toBeTruthy();
    expect(screen.getByText(/82%/)).toBeTruthy();
  });

  it('says how much of the money is still to collect from pay-at-hotel bookings, and nothing when none is', () => {
    const { unmount } = render(<PaymentsTab report={staffReport({ unpaidAtHotelCents: 150000 })} />);
    expect(screen.getByText(/Of this, 1.500,00.*pay-at-hotel bookings not marked as paid yet/)).toBeTruthy();
    unmount();

    render(<PaymentsTab report={staffReport()} />);
    expect(screen.queryByText(/pay-at-hotel bookings not marked as paid yet/)).toBeNull();
  });

  it('keeps that amount from someone who does not see money', () => {
    render(
      <MoneyVisibility hidden>
        <PaymentsTab report={staffReport({ unpaidAtHotelCents: 150000 })} />
      </MoneyVisibility>,
    );

    expect(screen.queryByText(/pay-at-hotel bookings not marked as paid yet/)).toBeNull();
  });

  it('lists each discount with its use count and money given, plus a total', () => {
    render(<PaymentsTab report={staffReport({ discountUsage: [
      { discountId: 'd1', label: 'Long stay: 7+ nights', redemptionCount: 2, discountCents: 12000 },
      { discountId: 'd2', label: 'Welcome code', redemptionCount: 1, discountCents: 3000 },
    ] })} />);

    const table = screen.getByRole('table', { name: 'Discounts used in this period' });
    expect(within(table).getByText('Long stay: 7+ nights')).toBeTruthy();
    expect(within(table).getByText('Total')).toBeTruthy();
    expect(within(table).getByText('3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What does Discount given mean?' })).toBeTruthy();
  });

  it('explains when nothing was paid or no discount was used', () => {
    render(<PaymentsTab report={staffReport({ paymentMethods: [], discountUsage: [] })} />);

    expect(screen.getByText(/nothing was paid in this period/)).toBeTruthy();
    expect(screen.getByText(/No discount or promo code was used/)).toBeTruthy();
  });
});
