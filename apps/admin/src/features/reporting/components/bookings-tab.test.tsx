// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/bookings-tab.test.tsx
 * @feature reporting
 */

import type { StaffReservation } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffRefund, staffReport } from '@/test/fixtures';
import { BookingsTab } from './bookings-tab';

interface DialogProps {
  stay: StaffReservation | null;
  onChanged: () => void;
}

vi.mock('@/features/reservations/components/stay-detail-dialog', () => ({
  StayDetailDialog: ({ stay, onChanged }: DialogProps): React.JSX.Element | null =>
    stay === null ? null : (
      <div role="dialog" aria-label="Booking detail">
        <p>{stay.bookerName}</p>
        <p data-testid="refund-count">{stay.refunds.length}</p>
        <button type="button" onClick={onChanged}>
          changed
        </button>
      </div>
    ),
}));

function renderTab(overrides: Partial<Parameters<typeof BookingsTab>[0]> = {}): { onStatusChange: ReturnType<typeof vi.fn>; onChanged: ReturnType<typeof vi.fn> } {
  const onStatusChange = vi.fn();
  const onChanged = vi.fn();
  render(<BookingsTab report={staffReport()} status={null} onStatusChange={onStatusChange} onChanged={onChanged} {...overrides} />);
  return { onStatusChange, onChanged };
}

describe('BookingsTab', () => {
  afterEach(cleanup);

  it('lists every booking and hold with the heading, its caption and a count', () => {
    renderTab();

    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeTruthy();
    expect(screen.getByText(/Every booking and unpaid hold/)).toBeTruthy();
    expect(screen.getByText('5 bookings')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Bookings in this period' })).getAllByRole('row')).toHaveLength(6);
  });

  it('shows how many guests each booking is for', () => {
    renderTab();

    const table = screen.getByRole('table', { name: 'Bookings in this period' });
    const headers = within(table).getAllByRole('columnheader').map((header): string => header.textContent ?? '');
    const guestColumn = headers.indexOf('Guests');
    expect(guestColumn).toBeGreaterThan(-1);
    const firstRow = within(table).getAllByRole('row')[1];
    expect(within(firstRow).getAllByRole('cell')[guestColumn].textContent).toMatch(/^\d+$/);
  });

  it('shows each status with how many there are and filters through the page', () => {
    const { onStatusChange } = renderTab();

    expect(screen.getByRole('button', { name: 'Confirmed (3)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Awaiting payment (1)' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelled (1)' }));
    expect(onStatusChange).toHaveBeenCalledWith('cancelled');
  });

  it('shows only the chosen status and lets the same chip clear it', () => {
    const { onStatusChange } = renderTab({ status: 'awaiting_payment' });

    expect(screen.getByText('1 booking')).toBeTruthy();
    expect(screen.getByText('Marie Curie')).toBeTruthy();
    expect(screen.queryByText('Grace Hopper')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Awaiting payment (1)' }));
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });

  it('searches, announces the count, clears with the x, and explains no matches', () => {
    renderTab();
    const box = screen.getByLabelText('Search bookings');

    fireEvent.change(box, { target: { value: 'grace' } });
    expect(screen.getByText('1 booking')).toBeTruthy();
    expect(screen.getByText('Grace Hopper')).toBeTruthy();

    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText(/No booking matches your search and filter/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('5 bookings')).toBeTruthy();
  });

  it('opens a booking with the refunds the report loaded for it', () => {
    const report = staffReport({ refunds: [staffRefund({ reservationId: 'b4' })] });
    renderTab({ report });

    fireEvent.click(screen.getByRole('button', { name: 'Open booking BK-DDDD000004' }));

    const dialog = screen.getByRole('dialog', { name: 'Booking detail' });
    expect(within(dialog).getByText('Linus Pauling')).toBeTruthy();
    expect(within(dialog).getByTestId('refund-count').textContent).toBe('1');
  });

  it('reloads the report when a booking is changed from its detail', () => {
    const { onChanged } = renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Open booking BK-AAAA000001' }));

    fireEvent.click(screen.getByRole('button', { name: 'changed' }));

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('explains an empty period and offers no filter results', () => {
    renderTab({ report: staffReport({ pipeline: [] }) });

    expect(screen.getByText(/No bookings in this period\. Try a longer period/)).toBeTruthy();
  });

  it('shows 50 at a time and offers the rest', () => {
    const base = staffReport();
    const many = Array.from({ length: 60 }, (_, index): StaffReservation => ({ ...base.pipeline[1]!, id: `m${index}`, reference: `BK-M${String(index).padStart(9, '0')}` }));
    renderTab({ report: staffReport({ pipeline: many }) });

    expect(within(screen.getByRole('table', { name: 'Bookings in this period' })).getAllByRole('row')).toHaveLength(51);
    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more' }));
    expect(within(screen.getByRole('table', { name: 'Bookings in this period' })).getAllByRole('row')).toHaveLength(61);
  });
});
