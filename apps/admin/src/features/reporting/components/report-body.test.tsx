// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/report-body.test.tsx
 * @feature reporting
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReport } from '@/test/fixtures';
import { TAB_PURPOSES } from '../utils/metric-definitions';
import { ReportBody } from './report-body';

vi.mock('@/features/reservations/components/stay-detail-dialog', () => ({ StayDetailDialog: (): null => null }));

function renderBody(tab: Parameters<typeof ReportBody>[0]['tab'] = 'overview'): ReturnType<typeof vi.fn> {
  const onTabChange = vi.fn();
  render(
    <ReportBody report={staffReport()} tab={tab} onTabChange={onTabChange} bookingStatus={null} onBookingStatusChange={vi.fn()} onOpenDetail={vi.fn()} onChanged={vi.fn()} />,
  );
  return onTabChange;
}

describe('ReportBody', () => {
  afterEach(cleanup);

  it('shows the five tabs and the one-line purpose of the open one', () => {
    renderBody('bookings');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Properties & stays', 'Bookings', 'Cancellations & refunds', 'Payments & offers']);
    expect(screen.getByRole('tab', { name: 'Bookings' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(TAB_PURPOSES.bookings)).toBeTruthy();
    expect(screen.queryByText(TAB_PURPOSES.overview)).toBeNull();
  });

  it('shows only the open panel on screen but keeps the others in the page for printing', () => {
    renderBody('payments');

    expect(screen.getByRole('tabpanel', { name: 'Payments & offers' })).toBeTruthy();
    expect(screen.queryByRole('tabpanel', { name: 'Overview' })).toBeNull();
    expect(document.getElementById('report-panel-overview')?.hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('report-panel-bookings')?.hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('report-panel-payments')?.hasAttribute('hidden')).toBe(false);
  });

  it('asks to change tab', () => {
    const onTabChange = renderBody('overview');

    fireEvent.click(screen.getByRole('tab', { name: 'Cancellations & refunds' }));

    expect(onTabChange).toHaveBeenCalledWith('cancellations');
  });

  it('renders each tab with its own captioned section', () => {
    renderBody('overview');

    for (const heading of ['Revenue and occupancy', 'Properties and stays', 'Bookings', 'Cancellations and refunds', 'How guests paid']) {
      expect(document.body.textContent).toContain(heading);
    }
  });
});
