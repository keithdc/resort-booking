// @vitest-environment jsdom
/**
 * @file apps/web/src/features/bookings/components/change-dates-panel.test.tsx
 * @feature bookings
 */

import type {
  GuestBooking,
  GuestBookingLookupRequest,
  HouseAvailability,
  MockPaymentOutcome,
  MockPaymentResult,
  PaymentSummary,
  RebookQuote,
  RebookRequest,
  RebookResult,
} from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDatesPanel } from './change-dates-panel';

const bookingsApi = vi.hoisted(() => ({
  fetchRebookAvailability: vi.fn<(request: GuestBookingLookupRequest) => Promise<HouseAvailability>>(),
  quoteRebook: vi.fn<(request: RebookRequest) => Promise<RebookQuote>>(),
  rebookBooking: vi.fn<(request: RebookRequest) => Promise<RebookResult>>(),
}));
const paymentsApi = vi.hoisted(() => ({
  completeMockPayment: vi.fn<(paymentId: string, outcome: MockPaymentOutcome) => Promise<MockPaymentResult>>(),
}));

vi.mock('../services/bookings-api', () => bookingsApi);
vi.mock('@/shared/services/payments-api', () => paymentsApi);

const CREDENTIALS = { reference: 'BK-OLD0000000', email: 'ada@example.com' };

function booking(overrides: Partial<GuestBooking> = {}): GuestBooking {
  return {
    reference: 'BK-OLD0000000',
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
    refundQuote: null,
    refund: null,
    rebookable: true,
    canChangeDates: true,
    changeDatesBlockedReason: null,
    replacedByReference: null,
    ...overrides,
  };
}

function quote(overrides: Partial<RebookQuote> = {}): RebookQuote {
  return {
    reference: 'BK-OLD0000000',
    newCheckIn: '2027-07-20',
    newCheckOut: '2027-07-22',
    nights: 2,
    currencyCode: 'EUR',
    lines: [{ label: 'Standard rate', nights: 2, nightlyRateCents: 62400, subtotalCents: 124800 }],
    subtotalCents: 124800,
    discounts: [],
    discountCents: 0,
    newTotalCents: 124800,
    feeCents: 2000,
    paidCents: 96000,
    balanceCents: 30800,
    payCents: 30800,
    refundCents: 0,
    available: true,
    problem: null,
    promoCode: null,
    ...overrides,
  };
}

const NEW_BOOKING = booking({ reference: 'BK-NEW0000000', checkIn: '2027-07-20', checkOut: '2027-07-22' });
const PAYMENT: PaymentSummary = { id: 'pay-1', holdId: 'x', provider: 'mock', status: 'requires_payment', amountCents: 30800, currencyCode: 'EUR', simulated: true };

function renderPanel(): { onChanged: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(<ChangeDatesPanel booking={booking()} credentials={CREDENTIALS} onChanged={onChanged} onClose={onClose} />);
  return { onChanged, onClose };
}

async function pickNewNights(): Promise<void> {
  // Same check-in, one more night: a real change without needing the calendar.
  fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '3' } });
}

function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

describe('ChangeDatesPanel', () => {
  beforeEach(() => {
    bookingsApi.fetchRebookAvailability.mockReset();
    bookingsApi.quoteRebook.mockReset();
    bookingsApi.rebookBooking.mockReset();
    paymentsApi.completeMockPayment.mockReset();
    bookingsApi.fetchRebookAvailability.mockResolvedValue({ houseId: 'h', from: 'a', to: 'b', unavailable: [], maxCheckOutDate: null });
  });

  afterEach(cleanup);

  it('starts with the current dates and will not price a change that is no change', async () => {
    renderPanel();

    expect((screen.getByLabelText(/^Nights/) as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('New check-out: 2027-07-12')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See the price' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Pick different dates to see what the change would cost.')).toBeTruthy();
  });

  it('works out the new check-out as the guest changes the nights', async () => {
    renderPanel();

    await pickNewNights();

    expect(screen.getByText('New check-out: 2027-07-13')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See the price' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows the exact price difference before anything changes', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote());
    renderPanel();
    await pickNewNights();

    await userEvent.click(screen.getByRole('button', { name: 'See the price' }));

    const summary = plain((await screen.findByLabelText('Price of the new dates')).textContent);
    expect(summary).toContain('You pay 308,00 € more');
    expect(summary).toContain('Change fee20,00 €');
    expect(bookingsApi.rebookBooking).not.toHaveBeenCalled();
  });

  it('puts the exact amount on the confirm button', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote());
    renderPanel();
    await pickNewNights();
    await userEvent.click(screen.getByRole('button', { name: 'See the price' }));

    expect(plain((await screen.findByRole('button', { name: /^Pay / })).textContent)).toBe('Pay 308,00 € and change my dates');
  });

  it('does not offer to confirm dates that are taken, and says why', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote({ available: false, problem: 'Those dates are not available for this stay.' }));
    renderPanel();
    await pickNewNights();
    await userEvent.click(screen.getByRole('button', { name: 'See the price' }));

    expect(await screen.findByText('Those dates are not available for this stay.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pay / }).hasAttribute('disabled')).toBe(true);
  });

  it('lets the guest go back and pick different dates after seeing the price', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote());
    renderPanel();
    await pickNewNights();
    await userEvent.click(screen.getByRole('button', { name: 'See the price' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Pick different dates' }));

    expect(screen.getByRole('button', { name: 'See the price' })).toBeTruthy();
    expect(screen.queryByLabelText('Price of the new dates')).toBeNull();
  });

  it('changes the dates straight away when a refund or nothing is due, reporting the new booking', async () => {
    const refund = { amountCents: 8000, percent: 100, currencyCode: 'EUR', status: 'succeeded' as const, simulated: true };
    bookingsApi.quoteRebook.mockResolvedValue(quote({ newTotalCents: 80000, payCents: 0, refundCents: 14000, balanceCents: -14000 }));
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'changed', booking: NEW_BOOKING, payment: null, refund });
    const { onChanged } = renderPanel();
    await pickNewNights();
    await userEvent.click(screen.getByRole('button', { name: 'See the price' }));

    await userEvent.click(await screen.findByRole('button', { name: /^Change my dates and get/ }));

    expect(onChanged).toHaveBeenCalledWith(NEW_BOOKING, refund);
  });

  it('takes the guest to payment when a balance is owed, and changes the dates once paid', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote());
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'payment_required', booking: booking(), payment: PAYMENT, refund: null });
    paymentsApi.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'succeeded' }, confirmation: null, rebookedBooking: NEW_BOOKING });
    const { onChanged } = renderPanel();
    await pickNewNights();
    await userEvent.click(screen.getByRole('button', { name: 'See the price' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Pay / }));

    expect(await screen.findByLabelText('Payment for the date change')).toBeTruthy();
    expect(screen.queryByLabelText(/^New check-in/)).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^Pay 308/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(NEW_BOOKING, null));
  });

  it('returns to the review with a clear message when the card is declined', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote());
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'payment_required', booking: booking(), payment: PAYMENT, refund: null });
    paymentsApi.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'failed' }, confirmation: null, rebookedBooking: null });
    const { onChanged } = renderPanel();
    await pickNewNights();
    await userEvent.click(screen.getByRole('button', { name: 'See the price' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Pay / }));

    await userEvent.click(await screen.findByRole('button', { name: 'Simulate a declined card' }));

    expect(await screen.findByText(/nothing was charged and your booking is unchanged/)).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('lets the guest keep their current dates', async () => {
    const { onClose } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Keep my current dates' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
