// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/cancellations-tab.test.tsx
 * @feature reporting
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { staffRefund, staffReport } from '@/test/fixtures';
import { CancellationsTab } from './cancellations-tab';

describe('CancellationsTab', () => {
  afterEach(cleanup);

  it('shows the three captioned sections', () => {
    render(<CancellationsTab report={staffReport()} />);

    expect(screen.getByRole('heading', { name: 'Cancellations and refunds' })).toBeTruthy();
    expect(screen.getByText(/Date changes are not counted as cancellations/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Why bookings were cancelled' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Refunds' })).toBeTruthy();
  });

  it('shows the numbers with a help icon each', () => {
    render(<CancellationsTab report={staffReport()} />);

    expect(screen.getByRole('heading', { name: 'Cancelled bookings' }).nextElementSibling).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What does Cancellation rate mean?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What does Kept from cancellations mean?' })).toBeTruthy();
  });

  it('lists the reasons in plain words with their share', () => {
    render(<CancellationsTab report={staffReport()} />);

    const list = screen.getByRole('list');
    expect(within(list).getByText('Guest asked')).toBeTruthy();
    expect(within(list).getByText('1 · 100%')).toBeTruthy();
  });

  it('lists each refund with its status, amount and percent', () => {
    render(<CancellationsTab report={staffReport({ refunds: [staffRefund({ amountCents: 8000, percent: 25, status: 'pending', reference: 'BK-DDDD000004' })] })} />);

    const table = screen.getByRole('table', { name: 'Refunds for cancelled bookings' });
    expect(within(table).getByText('BK-DDDD000004')).toBeTruthy();
    expect(within(table).getByText(/\(25%\)/)).toBeTruthy();
    expect(within(table).getByText('Pending')).toBeTruthy();
  });

  it('points to the refunds page when refunds still need paying', () => {
    render(<CancellationsTab report={staffReport()} />);

    expect(screen.getByText(/2 refunds still need paying/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the Refunds page' }).getAttribute('href')).toBe('/refunds');
  });

  it('explains an empty period for each section', () => {
    render(<CancellationsTab report={staffReport({ cancellationReasons: [], refunds: [], attention: { unpaidHoldCount: 0, refundsToPayCount: 0, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0, unpaidAtHotelArrivalsNext7DaysCount: 0, unpaidAtHotelPastCount: 0 } })} />);

    expect(screen.getAllByText(/No bookings were cancelled in this period/)).toHaveLength(2);
    expect(screen.getByText(/No refunds for this period/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open the Refunds page' })).toBeNull();
  });
});
