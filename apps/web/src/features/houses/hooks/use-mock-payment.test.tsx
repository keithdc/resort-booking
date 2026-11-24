// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/hooks/use-mock-payment.test.tsx
 * @feature houses
 */

import type { MockPaymentOutcome, MockPaymentResult, PaymentSummary, ReservationConfirmation } from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { useMockPayment } from './use-mock-payment';

const api = vi.hoisted(() => ({
  startPayment: vi.fn<(holdId: string) => Promise<PaymentSummary>>(),
  completeMockPayment: vi.fn<(paymentId: string, outcome: MockPaymentOutcome) => Promise<MockPaymentResult>>(),
}));

vi.mock('../services/payments-api', () => api);

const PAYMENT: PaymentSummary = {
  id: 'p1',
  holdId: 'h1',
  provider: 'mock',
  status: 'requires_payment',
  amountCents: 95200,
  currencyCode: 'EUR',
  simulated: true,
};

const CONFIRMATION: ReservationConfirmation = {
  reservationId: 'r1',
  reference: 'BK-ABC123',
  houseId: 'house',
  propertyId: 'prop',
  checkIn: '2027-10-01',
  checkOut: '2027-10-09',
  guestCount: 2,
  totalCents: 95200,
  currencyCode: 'EUR',
  bookerName: 'Ada',
  bookerEmail: 'ada@example.com',
};

describe('useMockPayment', () => {
  beforeEach(() => {
    api.startPayment.mockReset();
    api.completeMockPayment.mockReset();
    api.startPayment.mockResolvedValue(PAYMENT);
  });

  afterEach(cleanup);

  it('opens the payment for the hold and becomes ready', async () => {
    const { result } = renderHook(() => useMockPayment('h1'));
    expect(result.current.phase).toBe('starting');

    await waitFor(() => expect(result.current.phase).toBe('ready'));

    expect(api.startPayment).toHaveBeenCalledWith('h1');
    expect(result.current.payment?.amountCents).toBe(95200);
  });

  it('shows the API message when the payment cannot start, for example a hold that timed out', async () => {
    api.startPayment.mockRejectedValue(new ApiRequestError('Time ran out before payment.', 409, 'HOLD_EXPIRED'));

    const { result } = renderHook(() => useMockPayment('h1'));

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toBe('Time ran out before payment.');
  });

  it('falls back to a plain message for an unexpected failure', async () => {
    api.startPayment.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useMockPayment('h1'));

    await waitFor(() => expect(result.current.error).toBe('Could not start the payment'));
  });

  it('confirms the booking when paid', async () => {
    api.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'succeeded' }, confirmation: CONFIRMATION });
    const { result } = renderHook(() => useMockPayment('h1'));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    await act(async () => {
      await result.current.pay();
    });

    expect(api.completeMockPayment).toHaveBeenCalledWith('p1', 'success');
    expect(result.current.phase).toBe('confirmed');
    expect(result.current.confirmation?.reference).toBe('BK-ABC123');
  });

  it('reports a declined card when there is no confirmation', async () => {
    api.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'failed' }, confirmation: null });
    const { result } = renderHook(() => useMockPayment('h1'));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    await act(async () => {
      await result.current.decline();
    });

    expect(api.completeMockPayment).toHaveBeenCalledWith('p1', 'failure');
    expect(result.current.phase).toBe('declined');
    expect(result.current.confirmation).toBeNull();
  });

  it('shows the API error if paying fails, and does not confirm anything', async () => {
    api.completeMockPayment.mockRejectedValue(new ApiRequestError('Time ran out before payment.', 409, 'HOLD_EXPIRED'));
    const { result } = renderHook(() => useMockPayment('h1'));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    await act(async () => {
      await result.current.pay();
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBe('Time ran out before payment.');
    expect(result.current.confirmation).toBeNull();
  });

  it('ignores a second tap while the first is still in flight', async () => {
    let finish: (result: MockPaymentResult) => void = () => undefined;
    api.completeMockPayment.mockImplementationOnce(
      () =>
        new Promise<MockPaymentResult>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useMockPayment('h1'));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.pay();
    });
    await act(async () => {
      await result.current.pay();
    });
    await act(async () => {
      finish({ payment: { ...PAYMENT, status: 'succeeded' }, confirmation: CONFIRMATION });
      await first;
    });

    expect(api.completeMockPayment).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('confirmed');
  });

  it('does nothing if pay is pressed before the payment is open', async () => {
    api.startPayment.mockImplementation(() => new Promise<PaymentSummary>(() => undefined));
    const { result } = renderHook(() => useMockPayment('h1'));

    await act(async () => {
      await result.current.pay();
    });

    expect(api.completeMockPayment).not.toHaveBeenCalled();
  });

  it('starts a fresh payment when the hold changes', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useMockPayment(id), { initialProps: { id: 'h1' } });
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    rerender({ id: 'h2' });

    await waitFor(() => expect(api.startPayment).toHaveBeenCalledWith('h2'));
  });
});
