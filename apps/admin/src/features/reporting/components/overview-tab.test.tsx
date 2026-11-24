// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/overview-tab.test.tsx
 * @feature reporting
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReport } from '@/test/fixtures';
import { OverviewTab } from './overview-tab';

describe('OverviewTab', () => {
  afterEach(cleanup);

  it('shows the chart and insights under captioned headings', () => {
    render(<OverviewTab report={staffReport()} onOpenDetail={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Revenue and occupancy' })).toBeTruthy();
    expect(screen.getByText(/Bars show money from confirmed bookings/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Revenue as bars and occupancy as a line/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What stands out' })).toBeTruthy();
    expect(screen.getByText(/Revenue is/)).toBeTruthy();
  });

  it('opens the bookings behind a bar', () => {
    const onOpenDetail = vi.fn();
    render(<OverviewTab report={staffReport()} onOpenDetail={onOpenDetail} />);

    fireEvent.click(screen.getAllByRole('button', { name: /10 Jul 2027: revenue/ })[0]!);

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    const detail = onOpenDetail.mock.calls[0]?.[0] as { title: string; stays: { id: string }[] };
    expect(detail.title).toBe('10 Jul 2027');
    expect(detail.stays.map((stay) => stay.id)).toEqual(['b1']);
  });

  it('opens a bar with the keyboard', () => {
    const onOpenDetail = vi.fn();
    render(<OverviewTab report={staffReport()} onOpenDetail={onOpenDetail} />);

    fireEvent.keyDown(screen.getAllByRole('button', { name: /20 Jul 2027: revenue/ })[0]!, { key: 'Enter' });

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('repeats the numbers in a table for screen readers', () => {
    render(<OverviewTab report={staffReport()} onOpenDetail={vi.fn()} />);

    expect(screen.getByRole('table', { name: /Revenue and occupancy for each bar/ })).toBeTruthy();
  });

  it('explains an empty period instead of drawing an empty chart', () => {
    render(<OverviewTab report={staffReport({ reservationCount: 0, stays: [], daily: [], paymentMethods: [], properties: [] })} onOpenDetail={vi.fn()} />);

    expect(screen.getByText(/Nothing to draw for this period yet/)).toBeTruthy();
    expect(screen.getByText(/No bookings in this period\. Try a longer period/)).toBeTruthy();
  });
});
