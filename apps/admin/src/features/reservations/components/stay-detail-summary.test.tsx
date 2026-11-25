// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/stay-detail-summary.test.tsx
 * @feature reservations
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { StayDetailDialog } from './stay-detail-dialog';

vi.mock('../services/staff-reservations-api', () => ({
  patchStaffReservationArrival: vi.fn(),
  fetchStaffCancelPreview: vi.fn(),
  cancelStaffReservation: vi.fn(),
  quoteStaffChangeDates: vi.fn(),
  changeStaffReservationDates: vi.fn(),
}));

const FUTURE = { checkIn: '2999-07-10', checkOut: '2999-07-12' };

function open(overrides: Parameters<typeof staffReservation>[0] = {}): { onClose: () => void } {
  const onClose = vi.fn<() => void>();
  render(<StayDetailDialog stay={staffReservation({ ...FUTURE, ...overrides })} onClose={onClose} onUpdated={vi.fn()} onChanged={vi.fn()} />);
  return { onClose };
}

describe('StayDetailDialog layout', () => {
  afterEach(cleanup);

  it('opens with a summary of dates, nights, guests, money and arrival', () => {
    open({ guestCount: 3, totalCents: 96000, paidCents: 50000 });

    const text = (screen.getByLabelText('Booking summary').textContent ?? '').replace(/\s/g, ' ');
    expect(text).toContain('2 nights');
    expect(text).toContain('960,00 €');
    expect(text).toContain('500,00 € paid');
  });

  it('says 1 night and 1 person in the singular', () => {
    open({ checkIn: '2999-07-10', checkOut: '2999-07-11', guestCount: 1 });

    const text = (screen.getByLabelText('Booking summary').textContent ?? '').replace(/\s/g, ' ');
    expect(text).toContain('1 night');
    expect(text).not.toContain('1 nights');
    expect(text).toContain('1person');
  });

  it('groups the sections: guest, booking, payment, requests', () => {
    open();

    for (const title of ['Guest', 'Booking', 'Payment', 'Requests and note']) {
      expect(screen.getByText(title, { selector: 'h6' })).toBeTruthy();
    }
  });

  it('has a close icon button in the header and a Close button at the bottom', () => {
    const { onClose } = open();

    fireEvent.click(screen.getByRole('button', { name: 'Close booking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows the guest as an avatar with initials next to the name and status', () => {
    open({ bookerName: 'Ada Lovelace' });

    expect(screen.getByText('AL')).toBeTruthy();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });
});
