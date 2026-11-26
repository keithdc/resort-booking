// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/bookings-tab.test.tsx
 * @feature reporting
 */

import type { StaffReservation } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffRefund, staffReport, staffReservation } from '@/test/fixtures';
import { MoneyVisibility } from './money-visibility';
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
  describe('unpaid at the hotel', () => {
    const unpaidReport = (): ReturnType<typeof staffReport> => {
      const base = staffReport();
      const late = staffReservation({ id: 'u-late', reference: 'BK-LATEUNPAID', bookerName: 'Zed Late', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, checkIn: '2027-07-30', checkOut: '2027-08-01', totalCents: 50000 });
      const soon = staffReservation({ id: 'u-soon', reference: 'BK-SOONUNPAID', bookerName: 'Amy Soon', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, checkIn: '2027-07-17', checkOut: '2027-07-19', totalCents: 70000 });
      const past = staffReservation({ id: 'u-past', reference: 'BK-PASTUNPAID', bookerName: 'Bo Past', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, checkIn: '2027-07-10', checkOut: '2027-07-12', totalCents: 30000 });
      return { ...base, pipeline: [...base.pipeline, late, soon, past], unpaidAtHotelCount: 3, unpaidAtHotelCents: 150000, asOfDate: '2027-07-15' };
    };

    it('shows nothing about it when nobody owes money at the hotel', () => {
      renderTab();

      expect(screen.queryByText(/unpaid at the hotel in this period/)).toBeNull();
      expect(screen.getByRole('button', { name: /Unpaid at hotel \(0\)/ })).toBeTruthy();
    });

    it('says how many bookings are unpaid and how much is still to collect, with a button to show them', () => {
      const { onStatusChange } = renderTab({ report: unpaidReport() });

      expect(screen.getByText(/3 bookings are unpaid at the hotel in this period/)).toBeTruthy();
      expect(screen.getByText(/1.500,00/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Show them' }));

      expect(onStatusChange).toHaveBeenCalledWith('unpaid_at_hotel');
    });

    it('lists only the unpaid ones, the soonest check-in first, with how soon each guest arrives', () => {
      renderTab({ report: unpaidReport(), status: 'unpaid_at_hotel' });

      const table = screen.getByRole('table', { name: 'Bookings in this period' });
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => within(row).getAllByRole('button')[0]?.textContent)).toEqual(['BK-PASTUNPAID', 'BK-SOONUNPAID', 'BK-LATEUNPAID']);
      expect(within(rows[0]!).getByText('Check-in passed')).toBeTruthy();
      expect(within(rows[1]!).getByText('Arrives in 2 days')).toBeTruthy();
      // A check-in more than a week away carries no hint.
      expect(within(rows[2]!).queryByText(/Arrives|Check-in passed/)).toBeNull();
      expect(within(rows[0]!).getByText(/Pay at hotel · Pending/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Show them' })).toBeNull();
    });

    it('leaves the amount out of the banner for someone who does not see money', () => {
      render(
        <MoneyVisibility hidden>
          <BookingsTab report={unpaidReport()} status={null} onStatusChange={vi.fn()} onChanged={vi.fn()} />
        </MoneyVisibility>,
      );

      expect(screen.getByText(/3 bookings are unpaid at the hotel in this period/)).toBeTruthy();
      expect(screen.queryByText(/still to collect/)).toBeNull();
    });
  });
});
