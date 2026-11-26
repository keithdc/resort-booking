// @vitest-environment jsdom
/**
 * @file apps/web/src/features/bookings/components/manage-booking-page.test.tsx
 * @feature bookings
 */

import type {
  GuestBooking,
  GuestBookingLookupRequest,
  HouseAvailability,
  RebookQuote,
  RebookRequest,
  RebookResult,
} from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { ManageBookingPage } from './manage-booking-page';

const api = vi.hoisted(() => ({
  lookupBooking: vi.fn<(request: GuestBookingLookupRequest) => Promise<GuestBooking>>(),
  cancelBooking: vi.fn<(request: GuestBookingLookupRequest) => Promise<GuestBooking>>(),
  fetchRebookAvailability: vi.fn<(request: GuestBookingLookupRequest) => Promise<HouseAvailability>>(),
  quoteRebook: vi.fn<(request: RebookRequest) => Promise<RebookQuote>>(),
  rebookBooking: vi.fn<(request: RebookRequest) => Promise<RebookResult>>(),
}));

vi.mock('../services/bookings-api', () => api);

function booking(overrides: Partial<GuestBooking> = {}): GuestBooking {
  return {
    reference: 'BK-ABC1234567',
    reservationId: 'r1',
    stayName: 'Lake Chalet',
    propertyName: 'Alpine Lake',
    checkIn: '2027-07-10',
    checkOut: '2027-07-12',
    guestCount: 2,
    bookerName: 'Ada',
    totalCents: 96000,
    currencyCode: 'EUR',
    status: 'confirmed',
    canCancel: true,
    cancelBlockedReason: null,
    refundQuote: { paidCents: 96000, refundPercent: 75, refundCents: 72000, currencyCode: 'EUR', daysBeforeCheckIn: 4 },
    refund: null,
    rebookable: false,
    canChangeDates: false,
    changeDatesBlockedReason: 'The dates of this booking cannot be changed. To change them, cancel and book again.',
    replacedByReference: null,
    extras: [],
    ...overrides,
  };
}

function cancelled(refund: GuestBooking['refund']): GuestBooking {
  return booking({ status: 'cancelled', canCancel: false, refundQuote: null, refund });
}

function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

async function findBooking(): Promise<void> {
  fireEvent.change(screen.getByLabelText(/^Booking reference/), { target: { value: 'BK-ABC1234567' } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@example.com' } });
  await userEvent.click(screen.getByRole('button', { name: 'Find my booking' }));
}

describe('ManageBookingPage', () => {
  beforeEach(() => {
    api.lookupBooking.mockReset();
    api.cancelBooking.mockReset();
    api.fetchRebookAvailability.mockReset();
    api.fetchRebookAvailability.mockResolvedValue({ houseId: 'h', from: 'a', to: 'b', unavailable: [], maxCheckOutDate: null });
    api.quoteRebook.mockReset();
    api.rebookBooking.mockReset();
  });

  afterEach(cleanup);

  describe('finding a booking', () => {
    it('asks for the reference and email, with the button off until both are filled in', () => {
      render(<ManageBookingPage />);

      expect(screen.getByRole('button', { name: 'Find my booking' }).hasAttribute('disabled')).toBe(true);
      fireEvent.change(screen.getByLabelText(/^Booking reference/), { target: { value: 'BK-1' } });
      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'not-an-email' } });
      expect(screen.getByRole('button', { name: 'Find my booking' }).hasAttribute('disabled')).toBe(true);
    });

    it('prefills the reference from the address but never the email', () => {
      render(<ManageBookingPage initialReference="BK-FROM-LINK" />);

      expect((screen.getByLabelText(/^Booking reference/) as HTMLInputElement).value).toBe('BK-FROM-LINK');
      expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('');
    });

    it('shows the booking with its details', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      render(<ManageBookingPage />);

      await findBooking();

      const view = await screen.findByLabelText('Your booking');
      const text = plain(view.textContent);
      expect(text).toContain('BK-ABC1234567');
      expect(text).toContain('Confirmed');
      expect(text).toContain('Lake Chalet, Alpine Lake');
      expect(text).toContain('960,00 €');
    });

    it('lists the extras on the booking: a priced one with what it adds, a request as waiting for the property', async () => {
      api.lookupBooking.mockResolvedValue(
        booking({
          extras: [
            { id: 'e1', extraServiceId: 'x1', name: 'Breakfast basket', kind: 'instant', quantity: 2, unitPriceCents: 1800, lineCents: 3600, currencyCode: 'EUR', status: 'confirmed' },
            { id: 'e2', extraServiceId: 'x2', name: 'Extra pillows', kind: 'on_request', quantity: 1, unitPriceCents: 0, lineCents: 0, currencyCode: 'EUR', status: 'pending' },
          ],
        }),
      );
      render(<ManageBookingPage />);

      await findBooking();

      const text = plain((await screen.findByLabelText('Your booking')).textContent);
      expect(text).toContain('Extras');
      expect(text).toContain('Breakfast basket × 2 (36,00 €)');
      expect(text).toContain('Extra pillows × 1 (requested: the property will confirm, nothing charged yet)');
    });

    it('shows no extras line when the booking has none', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      render(<ManageBookingPage />);

      await findBooking();

      expect(plain((await screen.findByLabelText('Your booking')).textContent)).not.toContain('Extras');
    });

    it('shows the API message when no booking matches and keeps the form', async () => {
      api.lookupBooking.mockRejectedValue(new ApiRequestError('We could not find a booking with that reference and email.', 404, 'BOOKING_NOT_FOUND'));
      render(<ManageBookingPage />);

      await findBooking();

      expect(await screen.findByText('We could not find a booking with that reference and email.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Find my booking' })).toBeTruthy();
    });
  });

  describe('cancelling', () => {
    it('shows what cancelling would refund before anything is cancelled', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      render(<ManageBookingPage />);

      await findBooking();

      expect(plain((await screen.findByText(/If you cancel now you get/)).textContent)).toBe('If you cancel now you get 720,00 € back (75%).');
      expect(api.cancelBooking).not.toHaveBeenCalled();
    });

    it('needs a second, deliberate step: nothing is cancelled until the dialog is confirmed', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      render(<ManageBookingPage />);
      await findBooking();

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel this booking' }));

      expect(screen.getByRole('dialog').textContent).toContain('Cancel booking BK-ABC1234567?');
      expect(api.cancelBooking).not.toHaveBeenCalled();
    });

    it('backing out of the dialog leaves the booking confirmed', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      render(<ManageBookingPage />);
      await findBooking();
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel this booking' }));

      await userEvent.click(screen.getByRole('button', { name: 'Keep my booking' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(api.cancelBooking).not.toHaveBeenCalled();
      expect(screen.getByText('Confirmed')).toBeTruthy();
    });

    it('cancels once confirmed and shows the refund that was issued', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      api.cancelBooking.mockResolvedValue(cancelled({ amountCents: 72000, percent: 75, currencyCode: 'EUR', status: 'succeeded', simulated: true }));
      render(<ManageBookingPage />);
      await findBooking();
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel this booking' }));

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Cancel and refund/ }));

      expect(await screen.findByText('Cancelled')).toBeTruthy();
      expect(api.cancelBooking).toHaveBeenCalledWith({ reference: 'BK-ABC1234567', email: 'ada@example.com' });
      expect(plain((await screen.findByText(/Refunded:/)).textContent)).toContain('720,00 € (75%)');
      expect(screen.getByText(/Test mode: no real money moved/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Cancel this booking' })).toBeNull();
    });

    it('tells the guest honestly when the refund could not be sent', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      api.cancelBooking.mockResolvedValue(cancelled({ amountCents: 72000, percent: 75, currencyCode: 'EUR', status: 'failed', simulated: false }));
      render(<ManageBookingPage />);
      await findBooking();
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel this booking' }));

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Cancel and refund/ }));

      const notice = plain((await screen.findByText(/could not send your refund/)).textContent);
      expect(notice).toContain('720,00 €');
      expect(notice).toContain('BK-ABC1234567');
    });

    it('says a pending refund is being processed, without alarm', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      api.cancelBooking.mockResolvedValue(cancelled({ amountCents: 72000, percent: 75, currencyCode: 'EUR', status: 'pending', simulated: false }));
      render(<ManageBookingPage />);
      await findBooking();
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel this booking' }));

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Cancel and refund/ }));

      expect(await screen.findByText(/is being processed/)).toBeTruthy();
    });

    it('says plainly that no refund applies for a no-refund cancellation', async () => {
      api.lookupBooking.mockResolvedValue(
        booking({ refundQuote: { paidCents: 96000, refundPercent: 0, refundCents: 0, currencyCode: 'EUR', daysBeforeCheckIn: 0 } }),
      );
      api.cancelBooking.mockResolvedValue(cancelled({ amountCents: 0, percent: 0, currencyCode: 'EUR', status: 'succeeded', simulated: true }));
      render(<ManageBookingPage />);
      await findBooking();

      expect(await screen.findByText('If you cancel now you will not get a refund.')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel this booking' }));
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel without refund' }));

      expect(await screen.findByText(/No refund applies to this cancellation/)).toBeTruthy();
    });

    it('shows the API error and leaves the booking confirmed when cancelling fails', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      api.cancelBooking.mockRejectedValue(new ApiRequestError('This booking has already started. Please contact the property.', 409, 'CANCELLATION_NOT_ALLOWED'));
      render(<ManageBookingPage />);
      await findBooking();
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel this booking' }));

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Cancel and refund/ }));

      expect(await screen.findByText('This booking has already started. Please contact the property.')).toBeTruthy();
      expect(screen.getByText('Confirmed')).toBeTruthy();
    });
  });

  describe('a booking that cannot be cancelled online', () => {
    it('explains why instead of offering a button', async () => {
      api.lookupBooking.mockResolvedValue(
        booking({ canCancel: false, refundQuote: null, cancelBlockedReason: 'This booking has already started. Please contact the property.' }),
      );
      render(<ManageBookingPage />);

      await findBooking();

      expect(await screen.findByText('This booking has already started. Please contact the property.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Cancel this booking' })).toBeNull();
    });

    it('still gives a safe message when the API sent no reason', async () => {
      api.lookupBooking.mockResolvedValue(booking({ canCancel: false, refundQuote: null, cancelBlockedReason: null }));
      render(<ManageBookingPage />);

      await findBooking();

      expect(await screen.findByText(/can no longer be cancelled online/)).toBeTruthy();
    });
  });

  it('lets the guest look up another booking, forgetting the first', async () => {
    api.lookupBooking.mockResolvedValue(booking());
    render(<ManageBookingPage />);
    await findBooking();

    await userEvent.click(await screen.findByRole('button', { name: 'Look up another booking' }));

    expect((screen.getByLabelText(/^Booking reference/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('');
  });

  describe('changing dates', () => {
    it('offers Change dates only when the API says the dates can be changed', async () => {
      api.lookupBooking.mockResolvedValue(booking({ canChangeDates: true, changeDatesBlockedReason: null, rebookable: true }));
      render(<ManageBookingPage />);

      await findBooking();

      expect(await screen.findByRole('button', { name: 'Change dates' })).toBeTruthy();
    });

    it('explains why instead when the dates cannot be changed online', async () => {
      api.lookupBooking.mockResolvedValue(booking());
      render(<ManageBookingPage />);

      await findBooking();

      expect(await screen.findByText('The dates of this booking cannot be changed. To change them, cancel and book again.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Change dates' })).toBeNull();
    });

    it('shows the panel when Change dates is pressed, and hides it again on "Keep my current dates"', async () => {
      api.lookupBooking.mockResolvedValue(booking({ canChangeDates: true, changeDatesBlockedReason: null }));
      render(<ManageBookingPage />);
      await findBooking();

      await userEvent.click(await screen.findByRole('button', { name: 'Change dates' }));
      expect(screen.getByLabelText('Change your dates')).toBeTruthy();

      await userEvent.click(screen.getByRole('button', { name: 'Keep my current dates' }));
      expect(screen.queryByLabelText('Change your dates')).toBeNull();
      expect(screen.getByRole('button', { name: 'Change dates' })).toBeTruthy();
    });

    it('switches to the new booking with its new reference once the dates are changed', async () => {
      api.lookupBooking.mockResolvedValue(booking({ canChangeDates: true, changeDatesBlockedReason: null }));
      api.quoteRebook.mockResolvedValue({
        reference: 'BK-ABC1234567',
        newCheckIn: '2027-07-10',
        newCheckOut: '2027-07-13',
        nights: 3,
        currencyCode: 'EUR',
        lines: [],
        subtotalCents: 96000,
        discounts: [],
        discountCents: 0,
        extras: [],
        extrasCents: 0,
        newTotalCents: 96000,
        feeCents: 0,
        paidCents: 96000,
        balanceCents: 0,
        payCents: 0,
        refundCents: 0,
        available: true,
        problem: null,
        promoCode: null,
      });
      api.rebookBooking.mockResolvedValue({
        outcome: 'changed',
        booking: booking({ reference: 'BK-NEW0000000', checkIn: '2027-07-10', checkOut: '2027-07-13', canChangeDates: true, changeDatesBlockedReason: null }),
        payment: null,
        refund: null,
      });
      render(<ManageBookingPage />);
      await findBooking();
      await userEvent.click(await screen.findByRole('button', { name: 'Change dates' }));
      fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '3' } });
      await userEvent.click(screen.getByRole('button', { name: 'See the price' }));

      await userEvent.click(await screen.findByRole('button', { name: 'Change my dates' }));

      const notice = await screen.findByText(/Your dates are changed/);
      expect(plain(notice.textContent)).toContain('Your new booking reference is BK-NEW0000000');
      expect(plain(notice.textContent)).toContain('BK-ABC1234567 is replaced');
      expect(plain(screen.getByLabelText('Your booking').textContent)).toContain('BK-NEW0000000');
    });

    it('mentions a refund of the difference after a cheaper change', async () => {
      api.lookupBooking.mockResolvedValue(booking({ canChangeDates: true, changeDatesBlockedReason: null }));
      api.quoteRebook.mockResolvedValue({
        reference: 'BK-ABC1234567', newCheckIn: '2027-07-10', newCheckOut: '2027-07-11', nights: 1, currencyCode: 'EUR', lines: [], subtotalCents: 48000,
        discounts: [], discountCents: 0, extras: [], extrasCents: 0, newTotalCents: 48000, feeCents: 0, paidCents: 96000, balanceCents: -48000, payCents: 0, refundCents: 48000,
        available: true, problem: null, promoCode: null,
      });
      api.rebookBooking.mockResolvedValue({
        outcome: 'changed',
        booking: booking({ reference: 'BK-NEW0000000', checkOut: '2027-07-11' }),
        payment: null,
        refund: { amountCents: 48000, percent: 100, currencyCode: 'EUR', status: 'succeeded', simulated: true },
      });
      render(<ManageBookingPage />);
      await findBooking();
      await userEvent.click(await screen.findByRole('button', { name: 'Change dates' }));
      fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '1' } });
      await userEvent.click(screen.getByRole('button', { name: 'See the price' }));

      await userEvent.click(await screen.findByRole('button', { name: /^Change my dates and get/ }));

      expect(plain((await screen.findByText(/Your dates are changed/)).textContent)).toContain('480,00 € is being refunded to you');
    });

    it('points an old, replaced booking to the new one and opens it on request', async () => {
      const replaced = booking({
        status: 'cancelled',
        canCancel: false,
        refundQuote: null,
        canChangeDates: false,
        changeDatesBlockedReason: null,
        replacedByReference: 'BK-NEW0000000',
        refund: { amountCents: 0, percent: 0, currencyCode: 'EUR', status: 'succeeded', simulated: true },
      });
      api.lookupBooking.mockResolvedValueOnce(replaced).mockResolvedValueOnce(booking({ reference: 'BK-NEW0000000' }));
      render(<ManageBookingPage />);
      await findBooking();

      expect(await screen.findByText(/It was replaced by BK-NEW0000000/)).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Open the new booking' }));

      await waitFor(() => expect(api.lookupBooking).toHaveBeenLastCalledWith({ reference: 'BK-NEW0000000', email: 'ada@example.com' }));
      expect(plain((await screen.findByLabelText('Your booking')).textContent)).toContain('BK-NEW0000000');
    });
  });
});
