// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/mock-payment-panel.test.tsx
 * @feature houses
 */

import type { MockPaymentOutcome, MockPaymentResult, PaymentSummary, ReservationConfirmation } from '@resort-booking/shared-types';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockPaymentPanel } from './mock-payment-panel';

const api = vi.hoisted(() => ({
  startPayment: vi.fn<(holdId: string) => Promise<PaymentSummary>>(),
  completeMockPayment: vi.fn<(paymentId: string, outcome: MockPaymentOutcome) => Promise<MockPaymentResult>>(),
}));

vi.mock('@/shared/services/payments-api', () => api);

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

function renderPanel(): { onConfirmed: (c: ReservationConfirmation) => void; onDeclined: () => void } {
  const handlers = { onConfirmed: vi.fn<(c: ReservationConfirmation) => void>(), onDeclined: vi.fn<() => void>() };
  render(<MockPaymentPanel holdId="h1" {...handlers} />);
  return handlers;
}

function plain(content: string | null | undefined): string {
  return (content ?? '').replace(/\s/g, ' ');
}

describe('MockPaymentPanel', () => {
  beforeEach(() => {
    api.startPayment.mockReset();
    api.completeMockPayment.mockReset();
    api.startPayment.mockResolvedValue(PAYMENT);
  });

  afterEach(cleanup);

  it('shows a loading state while the payment opens', () => {
    api.startPayment.mockImplementation(() => new Promise<PaymentSummary>(() => undefined));

    renderPanel();

    expect(screen.getByLabelText('Preparing payment')).toBeTruthy();
  });

  it('says plainly that no real money moves and offers the exact amount to pay', async () => {
    renderPanel();

    const payButton = await screen.findByRole('button', { name: /^Pay / });

    expect(plain(payButton.textContent)).toContain('952,00 €');
    expect(screen.getByText(/no real money moves/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Simulate a declined card' })).toBeTruthy();
  });

  it('does not claim test mode for a real provider', async () => {
    api.startPayment.mockResolvedValue({ ...PAYMENT, provider: 'stripe', simulated: false });

    renderPanel();
    await screen.findByRole('button', { name: /^Pay / });

    expect(screen.queryByText(/no real money moves/i)).toBeNull();
  });

  it('reports the confirmed stay when paid', async () => {
    api.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'succeeded' }, confirmation: CONFIRMATION, rebookedBooking: null });
    const { onConfirmed } = renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /^Pay / }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(CONFIRMATION));
    expect(api.completeMockPayment).toHaveBeenCalledWith('p1', 'success');
  });

  it('shows the declined message and lets the guest try again', async () => {
    api.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'failed' }, confirmation: null, rebookedBooking: null });
    const { onDeclined, onConfirmed } = renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Simulate a declined card' }));

    expect(await screen.findByText(/card was declined and no money was taken/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onDeclined).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('shows the API message and hides the pay buttons when the payment cannot start', async () => {
    api.startPayment.mockRejectedValue(Object.assign(new Error('x'), {}));

    renderPanel();

    expect(await screen.findByText('Could not start the payment')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
  });

  it('disables both buttons while the payment is processing', async () => {
    api.completeMockPayment.mockImplementation(() => new Promise<MockPaymentResult>(() => undefined));
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /^Pay / }));

    expect(screen.getByRole('button', { name: 'Processing…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Simulate a declined card' }).hasAttribute('disabled')).toBe(true);
  });
});
