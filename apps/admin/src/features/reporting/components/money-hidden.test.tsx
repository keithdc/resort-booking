// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/money-hidden.test.tsx
 * @feature reporting
 * What an employee's report (moneyHidden) must not show: revenue cards, the revenue chart, the money tab, amounts.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReport, staffReservation } from '@/test/fixtures';
import { buildAttentionItems } from '../utils/attention-items';
import { buildReportCsv } from '../utils/report-csv';
import { AtAGlance } from './at-a-glance';
import { AttentionStrip } from './attention-strip';
import { BookingsTab } from './bookings-tab';
import { CancellationsTab } from './cancellations-tab';
import { MoneyVisibility } from './money-visibility';
import { OverviewTab } from './overview-tab';
import { ReportBody } from './report-body';

vi.mock('@/features/reservations/components/stay-detail-dialog', () => ({ StayDetailDialog: (): null => null }));

function hidden(children: React.ReactNode): React.JSX.Element {
  return <MoneyVisibility hidden>{children}</MoneyVisibility>;
}

describe('report with money hidden', () => {
  afterEach(cleanup);

  it('keeps bookings and occupancy cards but drops revenue and average rate', () => {
    render(hidden(<AtAGlance report={staffReport()} />));

    expect(screen.getByText('Bookings')).toBeTruthy();
    expect(screen.getByText('Occupancy')).toBeTruthy();
    expect(screen.queryByText('Revenue')).toBeNull();
    expect(screen.queryByText('Average nightly rate')).toBeNull();
  });

  it('shows all four cards when money is visible', () => {
    render(<AtAGlance report={staffReport()} />);

    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('Average nightly rate')).toBeTruthy();
  });

  it('has no Payments & offers tab, and falls back to the first tab for ?tab=payments', () => {
    render(
      hidden(
        <ReportBody report={staffReport()} tab="payments" onTabChange={vi.fn()} bookingStatus={null} onBookingStatusChange={vi.fn()} onOpenDetail={vi.fn()} onChanged={vi.fn()} />,
      ),
    );

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'Properties & stays', 'Bookings', 'Cancellations & refunds']);
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe('true');
  });

  it('replaces the revenue chart and insights with a short note', () => {
    render(hidden(<OverviewTab report={staffReport()} onOpenDetail={vi.fn()} />));

    expect(screen.getByText(/revenue chart and the revenue insights are for admins/)).toBeTruthy();
  });

  it('leaves the Amount column out of the bookings table', () => {
    const report = staffReport({ pipeline: [staffReservation()] });
    render(hidden(<BookingsTab report={report} status={null} onStatusChange={vi.fn()} onChanged={vi.fn()} />));

    expect(screen.queryByRole('columnheader', { name: 'Amount' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Payment' })).toBeTruthy();
  });

  it('leaves the refunded and kept tiles and the refunds list out of cancellations', () => {
    render(hidden(<CancellationsTab report={staffReport()} />));

    expect(screen.queryByText('Refunded')).toBeNull();
    expect(screen.queryByText('Kept from cancellations')).toBeNull();
    expect(screen.queryByText(/Refunds for cancelled bookings/)).toBeNull();
  });

  it('does not print "0,00 to send back" for refunds to pay', () => {
    const attention = { unpaidHoldCount: 0, refundsToPayCount: 2, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0 };
    expect(buildAttentionItems(attention, 'EUR', true).find((item) => item.key === 'refundsToPay')?.detail).toBeNull();
    render(hidden(<AttentionStrip attention={attention} currencyCode="EUR" onOpenTab={vi.fn()} />));

    expect(screen.getByRole('link', { name: '2 refunds to pay' })).toBeTruthy();
    expect(screen.queryByText(/to send back/)).toBeNull();
  });

  it('writes a CSV without any money rows or the Amount column', () => {
    const report = staffReport({ pipeline: [staffReservation()] });
    const csv = buildReportCsv(report, { propertyName: 'All', periodLabel: 'July', generatedOn: '2027-07-01', moneyHidden: true });
    const full = buildReportCsv(report, { propertyName: 'All', periodLabel: 'July', generatedOn: '2027-07-01' });

    expect(csv).not.toContain('Revenue');
    expect(csv).not.toContain('Average nightly rate');
    expect(csv).not.toContain('Amount');
    expect(csv).toContain('Occupancy (%)');
    expect(full).toContain('Revenue (after refunds)');
    expect(full).toContain('Amount');
  });
});
