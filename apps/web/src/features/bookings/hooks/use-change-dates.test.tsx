// @vitest-environment jsdom
/**
 * @file apps/web/src/features/bookings/hooks/use-change-dates.test.tsx
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
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { useChangeDates } from './use-change-dates';

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
    lines: [],
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

function setup(overrides: { credentials?: typeof CREDENTIALS | null; onChanged?: ReturnType<typeof vi.fn> } = {}): {
  result: ReturnType<typeof renderHook<ReturnType<typeof useChangeDates>, unknown>>['result'];
  onChanged: ReturnType<typeof vi.fn>;
} {
  const onChanged = overrides.onChanged ?? vi.fn();
  const credentials = overrides.credentials === undefined ? CREDENTIALS : overrides.credentials;
  const { result } = renderHook(() => useChangeDates({ credentials, booking: booking(), onChanged }));
  return { result, onChanged };
}

describe('useChangeDates', () => {
  beforeEach(() => {
    bookingsApi.fetchRebookAvailability.mockReset();
    bookingsApi.quoteRebook.mockReset();
    bookingsApi.rebookBooking.mockReset();
    paymentsApi.completeMockPayment.mockReset();
    bookingsApi.fetchRebookAvailability.mockResolvedValue({
      houseId: 'h',
      from: '2027-06-01',
      to: '2028-06-01',
      unavailable: [{ startDate: '2027-08-01', endDate: '2027-08-05' }],
      maxCheckOutDate: null,
    });
  });

  afterEach(cleanup);

  it('starts on the booking\'s current dates, with nothing to change yet', () => {
    const { result } = setup();

    expect(result.current.checkIn).toBe('2027-07-10');
    expect(result.current.nights).toBe('2');
    expect(result.current.checkOut).toBe('2027-07-12');
    expect(result.current.unchanged).toBe(true);
    expect(result.current.phase).toBe('choose');
  });

  it('loads the taken dates for this stay, with the booking\'s own dates counted as free', async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.unavailable).toHaveLength(1));
    expect(bookingsApi.fetchRebookAvailability).toHaveBeenCalledWith(CREDENTIALS);
  });

  it('keeps working with nothing disabled when the taken dates cannot be loaded', async () => {
    bookingsApi.fetchRebookAvailability.mockRejectedValue(new Error('offline'));
    const { result } = setup();

    await waitFor(() => expect(bookingsApi.fetchRebookAvailability).toHaveBeenCalled());
    expect(result.current.unavailable).toEqual([]);
  });

  it('derives the new check-out from the check-in and nights, and notices a real change', () => {
    const { result } = setup();

    act(() => {
      result.current.setCheckIn('2027-07-20');
      result.current.setNights('3');
    });

    expect(result.current.checkOut).toBe('2027-07-23');
    expect(result.current.unchanged).toBe(false);
  });

  it('asks the API for the price of the new dates and moves to the review', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote());
    const { result } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));

    await act(async () => {
      await result.current.seePrice();
    });

    expect(bookingsApi.quoteRebook).toHaveBeenCalledWith({ ...CREDENTIALS, newCheckIn: '2027-07-20', newCheckOut: '2027-07-22' });
    expect(result.current.phase).toBe('review');
    expect(result.current.quote?.payCents).toBe(30800);
  });

  it('forgets a quote as soon as the guest picks different dates', async () => {
    bookingsApi.quoteRebook.mockResolvedValue(quote());
    const { result } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));
    await act(async () => {
      await result.current.seePrice();
    });

    act(() => result.current.setNights('4'));

    expect(result.current.quote).toBeNull();
    expect(result.current.phase).toBe('choose');
  });

  it('shows the API message when the price cannot be worked out', async () => {
    bookingsApi.quoteRebook.mockRejectedValue(new ApiRequestError('The dates of this booking cannot be changed.', 409, 'REBOOK_NOT_ALLOWED'));
    const { result } = setup();

    await act(async () => {
      await result.current.seePrice();
    });

    expect(result.current.error).toBe('The dates of this booking cannot be changed.');
    expect(result.current.phase).toBe('choose');
  });

  it('changes the dates straight away when nothing more is owed, handing over the NEW booking and any refund', async () => {
    const refund = { amountCents: 8000, percent: 100, currencyCode: 'EUR', status: 'succeeded' as const, simulated: true };
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'changed', booking: NEW_BOOKING, payment: null, refund });
    const { result, onChanged } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));

    await act(async () => {
      await result.current.confirm();
    });

    expect(onChanged).toHaveBeenCalledWith(NEW_BOOKING, refund);
  });

  it('asks for the payment first when a balance is owed, and changes nothing yet', async () => {
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'payment_required', booking: booking(), payment: PAYMENT, refund: null });
    const { result, onChanged } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));

    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.phase).toBe('pay');
    expect(result.current.payment?.id).toBe('pay-1');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('changes the dates once the balance is paid', async () => {
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'payment_required', booking: booking(), payment: PAYMENT, refund: null });
    paymentsApi.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'succeeded' }, confirmation: null, rebookedBooking: NEW_BOOKING });
    const { result, onChanged } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));
    await act(async () => {
      await result.current.confirm();
    });

    await act(async () => {
      await result.current.pay();
    });

    expect(paymentsApi.completeMockPayment).toHaveBeenCalledWith('pay-1', 'success');
    expect(onChanged).toHaveBeenCalledWith(NEW_BOOKING, null);
  });

  it('leaves the booking unchanged and says so when the card is declined', async () => {
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'payment_required', booking: booking(), payment: PAYMENT, refund: null });
    paymentsApi.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'failed' }, confirmation: null, rebookedBooking: null });
    const { result, onChanged } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));
    await act(async () => {
      await result.current.confirm();
    });

    await act(async () => {
      await result.current.decline();
    });

    expect(paymentsApi.completeMockPayment).toHaveBeenCalledWith('pay-1', 'failure');
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('review');
    expect(result.current.error).toContain('your booking is unchanged');
  });

  it('shows the API message when the dates were taken while paying, and changes nothing', async () => {
    bookingsApi.rebookBooking.mockResolvedValue({ outcome: 'payment_required', booking: booking(), payment: PAYMENT, refund: null });
    paymentsApi.completeMockPayment.mockRejectedValue(new ApiRequestError('Those dates are no longer available.', 409, 'DATES_UNAVAILABLE'));
    const { result, onChanged } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));
    await act(async () => {
      await result.current.confirm();
    });

    await act(async () => {
      await result.current.pay();
    });

    expect(result.current.error).toBe('Those dates are no longer available.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('ignores a second tap while a request is running', async () => {
    let finish: (value: RebookResult) => void = () => undefined;
    bookingsApi.rebookBooking.mockImplementationOnce(() => new Promise<RebookResult>((resolve) => { finish = resolve; }));
    const { result, onChanged } = setup();
    act(() => result.current.setCheckIn('2027-07-20'));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.confirm();
    });
    await act(async () => {
      await result.current.confirm();
    });
    await act(async () => {
      finish({ outcome: 'changed', booking: NEW_BOOKING, payment: null, refund: null });
      await first;
    });

    expect(bookingsApi.rebookBooking).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a signed-in booking', async () => {
    const { result } = setup({ credentials: null });

    await act(async () => {
      await result.current.seePrice();
      await result.current.confirm();
    });

    expect(bookingsApi.fetchRebookAvailability).not.toHaveBeenCalled();
    expect(bookingsApi.quoteRebook).not.toHaveBeenCalled();
    expect(bookingsApi.rebookBooking).not.toHaveBeenCalled();
  });
});
