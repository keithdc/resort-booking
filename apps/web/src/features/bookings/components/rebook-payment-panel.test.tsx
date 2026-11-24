// @vitest-environment jsdom
/**
 * @file apps/web/src/features/bookings/components/rebook-payment-panel.test.tsx
 * @feature bookings
 */

import type { PaymentSummary } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RebookPaymentPanel } from './rebook-payment-panel';

const PAYMENT: PaymentSummary = { id: 'p', holdId: 'x', provider: 'mock', status: 'requires_payment', amountCents: 30800, currencyCode: 'EUR', simulated: true };

function renderPanel(payment: PaymentSummary = PAYMENT, working = false): { onPay: () => void; onDecline: () => void } {
  const handlers = { onPay: vi.fn<() => void>(), onDecline: vi.fn<() => void>() };
  render(<RebookPaymentPanel payment={payment} working={working} {...handlers} />);
  return handlers;
}

describe('RebookPaymentPanel', () => {
  afterEach(cleanup);

  it('puts the exact amount on the pay button', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /^Pay / }).textContent?.replace(/\s/g, ' ')).toBe('Pay 308,00 €');
  });

  it('says plainly that dates change only once the payment goes through', () => {
    renderPanel();

    expect(screen.getByText('Your dates change only once this payment goes through.')).toBeTruthy();
  });

  it('says no real money moves in test mode, and not for a real provider', () => {
    const { unmount } = render(<RebookPaymentPanel payment={PAYMENT} working={false} onPay={vi.fn<() => void>()} onDecline={vi.fn<() => void>()} />);
    expect(screen.getByText(/no real money moves/i)).toBeTruthy();
    unmount();

    renderPanel({ ...PAYMENT, simulated: false });
    expect(screen.queryByText(/no real money moves/i)).toBeNull();
  });

  it('pays or declines on the matching button', async () => {
    const { onPay, onDecline } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /^Pay / }));
    await userEvent.click(screen.getByRole('button', { name: 'Simulate a declined card' }));

    expect(onPay).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while processing', () => {
    renderPanel(PAYMENT, true);

    expect(screen.getByRole('button', { name: 'Processing…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Simulate a declined card' }).hasAttribute('disabled')).toBe(true);
  });
});
