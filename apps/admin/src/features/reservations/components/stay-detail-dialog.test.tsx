// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/stay-detail-dialog.test.tsx
 * @feature reservations
 */

import type {
  BookingSource,
  ArrivalStatus,
  RebookQuote,
  StaffBookingNote,
  StaffCancelPreview,
  StaffCancelRequest,
  StaffCancelResult,
  StaffChangeDatesRequest,
  StaffChangeQuoteRequest,
  StaffChangeResult,
  StaffReservation,
} from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { rebookQuote, staffCancellation, staffChange, staffRefund, staffReservation } from '@/test/fixtures';
import { StayDetailDialog } from './stay-detail-dialog';

const api = vi.hoisted(() => ({
  patchStaffReservationArrival: vi.fn<(id: string, status: ArrivalStatus) => Promise<StaffReservation>>(),
  fetchStaffCancelPreview: vi.fn<(id: string) => Promise<StaffCancelPreview>>(),
  cancelStaffReservation: vi.fn<(id: string, body: StaffCancelRequest) => Promise<StaffCancelResult>>(),
  quoteStaffChangeDates: vi.fn<(id: string, body: StaffChangeQuoteRequest) => Promise<RebookQuote>>(),
  changeStaffReservationDates: vi.fn<(id: string, body: StaffChangeDatesRequest) => Promise<StaffChangeResult>>(),
  markStaffReservationPaid: vi.fn<(id: string) => Promise<StaffReservation>>(),
  fetchStaffBookingNotes: vi.fn<(id: string) => Promise<StaffBookingNote[]>>(),
  addStaffBookingNote: vi.fn<(id: string, body: string) => Promise<StaffBookingNote>>(),
  removeStaffBookingNote: vi.fn<(id: string, noteId: string) => Promise<void>>(),
  changeStaffReservationSource: vi.fn<(id: string, source: BookingSource) => Promise<StaffReservation>>(),
}));

const role = vi.hoisted(() => ({ canManageRefunds: true, isAdmin: true }));

vi.mock('@/shared/hooks/use-staff-role', () => ({ useCanManageRefunds: (): boolean => role.canManageRefunds, useIsAdmin: (): boolean => role.isAdmin }));
vi.mock('../services/staff-reservations-api', () => api);

// "Today" is fixed so a booking can reliably be in the future or the past.
const FUTURE = { checkIn: '2999-07-10', checkOut: '2999-07-12' };

const PREVIEW: StaffCancelPreview = {
  reservationId: 'r1',
  reference: 'BK-ABC1234567',
  paidCents: 96000,
  currencyCode: 'EUR',
  canCancel: true,
  blockedReason: null,
  notice: null,
  policyRefund: { paidCents: 96000, refundPercent: 100, refundCents: 96000, currencyCode: 'EUR', daysBeforeCheckIn: 400 },
};

const localToday = (): string => {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s/g, ' ');

function renderDialog(stay: StaffReservation): { onClose: () => void; onUpdated: (stay: StaffReservation) => void; onChanged: () => void } {
  const handlers = {
    onClose: vi.fn<() => void>(),
    onUpdated: vi.fn<(stay: StaffReservation) => void>(),
    onChanged: vi.fn<() => void>(),
  };
  render(<StayDetailDialog stay={stay} {...handlers} />);
  return handlers;
}

describe('StayDetailDialog', () => {
  beforeEach(() => {
    role.canManageRefunds = true;
    role.isAdmin = true;
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchStaffCancelPreview.mockResolvedValue(PREVIEW);
    api.fetchStaffBookingNotes.mockResolvedValue([]);
  });

  afterEach(cleanup);

  describe('what it shows', () => {
    it('shows the booking reference, what was paid and the total', () => {
      renderDialog(staffReservation({ ...FUTURE, paidCents: 50000, totalCents: 96000 }));

      const dialog = plain(screen.getByRole('dialog').textContent);
      expect(dialog).toContain('BK-ABC1234567');
      expect(dialog).toContain('Paid so far500,00 €');
      expect(dialog).toContain('Total960,00 €');
    });

    it('lists the extras on the booking: a priced one with what it adds, a request as waiting and not charged', () => {
      renderDialog(
        staffReservation({
          ...FUTURE,
          extras: [
            { id: 'e1', extraServiceId: 'x1', name: 'Breakfast basket', kind: 'instant', quantity: 2, unitPriceCents: 1800, lineCents: 3600, currencyCode: 'EUR', status: 'confirmed' },
            { id: 'e2', extraServiceId: 'x2', name: 'Extra pillows', kind: 'on_request', quantity: 1, unitPriceCents: 0, lineCents: 0, currencyCode: 'EUR', status: 'pending' },
          ],
        }),
      );

      const list = within(screen.getByRole('list', { name: 'Extras on this booking' }));
      expect(plain(list.getByText(/Breakfast basket × 2/).textContent)).toContain('36,00');
      expect(list.getByText(/Extra pillows × 1 · On request: waiting for the property to confirm, nothing charged/)).toBeTruthy();
    });

    it('says no extras were chosen when there are none', () => {
      renderDialog(staffReservation({ ...FUTURE }));

      expect(screen.getByText('None chosen')).toBeTruthy();
      expect(screen.queryByRole('list', { name: 'Extras on this booking' })).toBeNull();
    });

    it('says when the guest accepted the cancellation terms, or that it was not recorded', () => {
      const { unmount } = render(
        <StayDetailDialog stay={staffReservation({ ...FUTURE, termsAcceptedAt: '2027-05-01T10:30:00.000Z' })} onClose={vi.fn<() => void>()} onUpdated={vi.fn<(s: StaffReservation) => void>()} onChanged={vi.fn<() => void>()} />,
      );
      expect(screen.getByText('Accepted the cancellation terms on 1 May 2027, 10:30 UTC')).toBeTruthy();
      unmount();

      renderDialog(staffReservation({ ...FUTURE, termsAcceptedAt: null }));
      expect(screen.getByText('Not recorded', { selector: 'p' })).toBeTruthy();
    });

    it('shows who cancelled and why for a cancelled booking, with its refund', () => {
      renderDialog(
        staffReservation({
          ...FUTURE,
          status: 'cancelled',
          cancellation: staffCancellation({ initiatedBy: 'staff', staffName: 'Marie', reason: 'property_cancelled', note: 'Burst pipe' }),
          refunds: [staffRefund({ amountCents: 96000, percent: 100, provider: 'mock', status: 'succeeded' })],
        }),
      );

      expect(screen.getByText('Cancelled by staff (Marie): We could not host')).toBeTruthy();
      expect(screen.getByText('Burst pipe')).toBeTruthy();
      expect(plain(within(screen.getByRole('list', { name: 'Refunds' })).getByRole('listitem').textContent)).toContain(
        'Cancellation refund: 960,00 € (100%)',
      );
    });

    it('shows the date-change history and the link to the booking that replaced this one', () => {
      renderDialog(
        staffReservation({
          ...FUTURE,
          status: 'cancelled',
          replacedByReference: 'BK-NEW0000000',
          changes: [staffChange({ initiatedBy: 'staff', staffName: 'Marie', note: 'Called from the road' })],
        }),
      );

      expect(screen.getByText('Replaced by BK-NEW0000000')).toBeTruthy();
      expect(screen.getByText(/Called from the road/)).toBeTruthy();
    });

    it('shows no cancellation block for a booking that is not cancelled', () => {
      renderDialog(staffReservation(FUTURE));

      expect(screen.queryByText('Cancellation', { selector: 'h6' })).toBeNull();
      expect(screen.getByText('No refunds recorded')).toBeTruthy();
    });

    it('keeps showing everything it showed before', () => {
      renderDialog(staffReservation({ ...FUTURE, guestNote: 'Late arrival', requestNames: ['Extra pillows'] }));

      const dialog = plain(screen.getByRole('dialog').textContent);
      expect(dialog).toContain('Lake Chalet');
      expect(dialog).toContain('ada@example.com');
      expect(dialog).toContain('Late arrival');
      expect(dialog).toContain('Extra pillows');
    });
  });

  describe('which actions it offers', () => {
    it('offers cancel and change dates on a confirmed booking that has not started', () => {
      renderDialog(staffReservation(FUTURE));

      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Change dates' })).toBeTruthy();
    });

    it('offers neither on a cancelled booking', () => {
      renderDialog(staffReservation({ ...FUTURE, status: 'cancelled' }));

      expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Change dates' })).toBeNull();
    });

    it('offers neither on a hold, which is not a booking yet', () => {
      renderDialog(staffReservation({ ...FUTURE, kind: 'hold', status: 'active' }));

      expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Change dates' })).toBeNull();
    });

    it('still offers cancel but not change dates once the guest is in the house', () => {
      renderDialog(staffReservation({ ...FUTURE, arrivalStatus: 'checked_in' }));

      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Change dates' })).toBeNull();
    });

    it('does not offer to change dates when the check-in is already in the past', () => {
      renderDialog(staffReservation({ checkIn: '2020-01-10', checkOut: '2020-01-12' }));

      expect(screen.queryByRole('button', { name: 'Change dates' })).toBeNull();
    });

    it('on the check-in day, without refund access: Cancel stays available (it refunds nothing), Change dates is disabled with the reason', () => {
      role.canManageRefunds = false;
      renderDialog(staffReservation({ checkIn: localToday(), checkOut: '2999-01-01' }));

      expect((screen.getByRole('button', { name: 'Cancel booking' }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByRole('button', { name: 'Change dates' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Check-in is today (or has passed). An admin has to cancel or change this booking.')).toBeTruthy();
    });

    it('also lets an employee without refund access cancel a stay that began earlier (no change-dates button there)', () => {
      role.canManageRefunds = false;
      renderDialog(staffReservation({ checkIn: '2020-01-10', checkOut: '2999-01-01' }));

      expect((screen.getByRole('button', { name: 'Cancel booking' }) as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Change dates' })).toBeNull();
    });

    it('keeps an employee able to act on a booking that starts in the future', () => {
      role.canManageRefunds = false;
      renderDialog(staffReservation(FUTURE));

      expect((screen.getByRole('button', { name: 'Cancel booking' }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByRole('button', { name: 'Change dates' }) as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByText(/An admin has to cancel or change/)).toBeNull();
    });

    it('never locks an admin or an employee with refund access, even on the check-in day (Change dates stays enabled)', () => {
      renderDialog(staffReservation({ checkIn: localToday(), checkOut: '2999-01-01' }));

      expect((screen.getByRole('button', { name: 'Cancel booking' }) as HTMLButtonElement).disabled).toBe(false);
      expect((screen.getByRole('button', { name: 'Change dates' }) as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByText(/An admin has to cancel or change/)).toBeNull();
    });

    it('keeps check-in available as before', () => {
      renderDialog(staffReservation(FUTURE));

      expect(screen.getByRole('button', { name: 'Check in' })).toBeTruthy();
    });
  });

  describe('cancelling', () => {
    async function cancelThroughTheDialog(): Promise<void> {
      await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
      await screen.findByText(/The guest has paid/);
      fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Guest rang on the 3rd' } });
      await userEvent.click(screen.getByRole('button', { name: /^Cancel and refund/ }));
    }

    it('opens the cancel dialog without cancelling anything yet', async () => {
      renderDialog(staffReservation(FUTURE));

      await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));

      expect(await screen.findByText('Cancel booking BK-ABC1234567?')).toBeTruthy();
      expect(api.cancelStaffReservation).not.toHaveBeenCalled();
    });

    it('updates the booking, refreshes the lists and says what was refunded', async () => {
      const cancelled = staffReservation({ ...FUTURE, status: 'cancelled', cancellation: staffCancellation() });
      api.cancelStaffReservation.mockResolvedValue({ reservation: cancelled, refund: staffRefund({ amountCents: 96000, provider: 'mock', status: 'succeeded' }) });
      const { onUpdated, onChanged } = renderDialog(staffReservation(FUTURE));

      await cancelThroughTheDialog();

      await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(cancelled));
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(plain((await screen.findByText(/Booking cancelled, refund of/)).textContent)).toBe('Booking cancelled, refund of 960,00 € recorded');
    });

    it('tells staff a hand refund is waiting on the Refunds page', async () => {
      api.cancelStaffReservation.mockResolvedValue({
        reservation: staffReservation({ ...FUTURE, status: 'cancelled' }),
        refund: staffRefund({ provider: 'manual', status: 'pending' }),
      });
      renderDialog(staffReservation(FUTURE));

      await cancelThroughTheDialog();

      expect(await screen.findByText(/must be sent by hand, see Refunds/)).toBeTruthy();
    });
  });

  describe('changing dates', () => {
    it('opens the change dialog without changing anything yet', async () => {
      renderDialog(staffReservation(FUTURE));

      await userEvent.click(screen.getByRole('button', { name: 'Change dates' }));

      expect(await screen.findByText('Change the dates of BK-ABC1234567')).toBeTruthy();
      expect(api.changeStaffReservationDates).not.toHaveBeenCalled();
    });

    it('closes the old booking, refreshes the lists and gives the new reference after a change', async () => {
      api.quoteStaffChangeDates.mockResolvedValue(rebookQuote({ newTotalCents: 80000, payCents: 0, refundCents: 12000, balanceCents: -12000 }));
      api.changeStaffReservationDates.mockResolvedValue({ reservation: staffReservation({ id: 'r2', reference: 'BK-NEW0000000' }), refund: null });
      const { onChanged, onClose } = renderDialog(staffReservation(FUTURE));
      await userEvent.click(screen.getByRole('button', { name: 'Change dates' }));
      fireEvent.change(await screen.findByLabelText(/^New check-in/), { target: { value: '2999-08-20' } });
      await userEvent.click(screen.getByRole('button', { name: 'See price' }));
      await screen.findByLabelText('Price of the new dates');
      fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Guest asked to shorten' } });

      await userEvent.click(screen.getByRole('button', { name: /^Change dates and refund/ }));

      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Dates changed. The new booking is BK-NEW0000000')).toBeTruthy();
    });
  });

  describe('where the booking came from', () => {
    it('shows the source as a chip in the header and in the booking block, also for a booking made on another site', () => {
      renderDialog(staffReservation({ ...FUTURE, bookingSource: 'airbnb', paymentMethod: 'paid_by_channel' }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByLabelText('Booked via Airbnb')).toBeTruthy();
      expect(plain(dialog.textContent)).toContain('Where it came from');
      expect(plain(dialog.textContent)).toContain('Paid on the other website');
    });

    it('lets an admin correct it inside the same group, saves it and reports the booking back', async () => {
      const updated = staffReservation({ ...FUTURE, bookingSource: 'booking_com', paymentMethod: 'paid_by_channel' });
      api.changeStaffReservationSource.mockResolvedValue(updated);
      const handlers = renderDialog(staffReservation({ ...FUTURE, bookingSource: 'airbnb', paymentMethod: 'paid_by_channel' }));

      await userEvent.click(screen.getByRole('button', { name: 'Change where this booking came from' }));
      await userEvent.click(screen.getByRole('combobox', { name: 'Corrected source' }));
      const options = screen.getAllByRole('option').map((option) => option.textContent);
      expect(options).toEqual(['Booking.com', 'Another website']);
      await userEvent.click(screen.getByRole('option', { name: 'Booking.com' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(api.changeStaffReservationSource).toHaveBeenCalledWith('r1', 'booking_com'));
      expect(handlers.onUpdated).toHaveBeenCalledWith(updated);
    });

    it('offers an own booking only the other own sources (never an outside site)', async () => {
      renderDialog(staffReservation({ ...FUTURE, bookingSource: 'phone_email' }));

      await userEvent.click(screen.getByRole('button', { name: 'Change where this booking came from' }));
      await userEvent.click(screen.getByRole('combobox', { name: 'Corrected source' }));

      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Our website', 'Walk-in']);
    });

    it('shows the API\'s words when the correction is refused', async () => {
      api.changeStaffReservationSource.mockRejectedValue(new ApiRequestError('The booking already has that source.', 409, { code: 'NO_CHANGE' }));
      renderDialog(staffReservation({ ...FUTURE, bookingSource: 'walk_in' }));

      await userEvent.click(screen.getByRole('button', { name: 'Change where this booking came from' }));
      await userEvent.click(screen.getByRole('combobox', { name: 'Corrected source' }));
      await userEvent.click(screen.getByRole('option', { name: 'Our website' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('The booking already has that source.')).toBeTruthy();
    });

    it('leaves the correction to admins: an employee only reads the source', () => {
      role.isAdmin = false;
      renderDialog(staffReservation({ ...FUTURE, bookingSource: 'airbnb', paymentMethod: 'paid_by_channel' }));

      expect(screen.queryByRole('button', { name: 'Change where this booking came from' })).toBeNull();
      expect(within(screen.getByRole('dialog')).getAllByText('Airbnb').length).toBeGreaterThan(0);
    });
  });

  describe('arrival (as before)', () => {
    it('checks the guest in and says so', async () => {
      const updated = staffReservation({ ...FUTURE, arrivalStatus: 'checked_in' });
      api.patchStaffReservationArrival.mockResolvedValue(updated);
      const { onUpdated } = renderDialog(staffReservation(FUTURE));

      await userEvent.click(screen.getByRole('button', { name: 'Check in' }));

      await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
      expect(await screen.findByText('Arrival updated')).toBeTruthy();
    });
  });
  describe('pay at hotel: payment pending', () => {
    const PENDING = { ...FUTURE, paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, totalCents: 96000, createdByName: 'Eve Employee', bookerPhone: '', termsAcceptedAt: null } as const;

    it('shows the pending chip, "not paid yet", who made the booking, and no phone link when none was given', () => {
      renderDialog(staffReservation(PENDING));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getAllByText('Pay at hotel · Pending').length).toBeGreaterThan(0);
      expect(plain(dialog.textContent)).toContain('Not paid yet: pay at hotel');
      expect(plain(dialog.textContent)).toContain('Eve Employee (staff)');
      expect(plain(dialog.textContent)).toContain('Booked by staff: the guest did not accept terms online');
      expect(within(dialog).getByText('Not given')).toBeTruthy();
    });

    it('marks it paid after a confirmation that says it is audited, then reports the new state', async () => {
      const paid = staffReservation({ ...PENDING, paymentStatus: 'paid', paidCents: 96000, paidAt: '2999-07-10T10:00:00.000Z' });
      api.markStaffReservationPaid.mockResolvedValue(paid);
      const { onUpdated, onChanged } = renderDialog(staffReservation(PENDING));

      await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
      const confirm = await screen.findByRole('dialog', { name: /Mark BK-ABC1234567 as paid\?/ });
      expect(plain(confirm.textContent)).toContain('Use this once the guest has paid you at the hotel. It is recorded in the audit log with your name.');
      expect(api.markStaffReservationPaid).not.toHaveBeenCalled();
      await userEvent.click(within(confirm).getByRole('button', { name: 'Mark as paid' }));

      await waitFor(() => expect(api.markStaffReservationPaid).toHaveBeenCalledWith('r1'));
      await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(paid));
      expect(onChanged).toHaveBeenCalled();
    });

    it('keeps the confirmation open and shows the API\'s words when marking fails (already paid, say)', async () => {
      api.markStaffReservationPaid.mockRejectedValue(new ApiRequestError('This booking is already marked as paid.', 409, { code: 'ALREADY_PAID' }));
      const { onUpdated } = renderDialog(staffReservation(PENDING));

      await userEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
      const confirm = await screen.findByRole('dialog', { name: /Mark BK-ABC1234567 as paid\?/ });
      await userEvent.click(within(confirm).getByRole('button', { name: 'Mark as paid' }));

      expect(await within(confirm).findByText('This booking is already marked as paid.')).toBeTruthy();
      expect(onUpdated).not.toHaveBeenCalled();
    });

    it('has nothing to mark for a paid, online or cancelled booking, and a person with refund access can mark a pending one', () => {
      role.canManageRefunds = false;
      renderDialog(staffReservation({ ...PENDING, paymentStatus: 'paid', paidCents: 96000, paidAt: '2999-07-10T10:00:00.000Z' }));
      expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();
      expect(screen.getAllByText('Paid at hotel').length).toBeGreaterThan(0);
      cleanup();

      renderDialog(staffReservation({ ...FUTURE }));
      expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();
      expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
      cleanup();

      renderDialog(staffReservation({ ...PENDING, status: 'cancelled' }));
      expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();
      cleanup();

      role.canManageRefunds = true;
      renderDialog(staffReservation(PENDING));
      const button = screen.getByRole('button', { name: 'Mark as paid' }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it('shows an employee without refund access a disabled button and who to ask', () => {
      role.canManageRefunds = false;
      renderDialog(staffReservation(PENDING));
      const button = screen.getByRole('button', { name: 'Mark as paid' }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(screen.getByText(/Ask an admin, or an admin can give you refund access on the Team page/)).toBeTruthy();
    });

    it('shows no hint to someone with refund access', () => {
      role.canManageRefunds = true;
      renderDialog(staffReservation(PENDING));
      expect(screen.queryByText(/Ask an admin, or an admin can give you refund access/)).toBeNull();
    });
  });
});
