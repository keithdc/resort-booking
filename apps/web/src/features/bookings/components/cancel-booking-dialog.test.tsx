// @vitest-environment jsdom
/**
 * @file apps/web/src/features/bookings/components/cancel-booking-dialog.test.tsx
 * @feature bookings
 */

import type { RefundQuote } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelBookingDialog } from './cancel-booking-dialog';

const QUOTE: RefundQuote = { paidCents: 96000, refundPercent: 75, refundCents: 72000, currencyCode: 'EUR', daysBeforeCheckIn: 4 };

function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

function renderDialog(quote: RefundQuote = QUOTE, pending = false): { onKeep: () => void; onConfirm: () => void } {
  const handlers = { onKeep: vi.fn<() => void>(), onConfirm: vi.fn<() => void>() };
  render(<CancelBookingDialog open quote={quote} reference="BK-ABC1234567" pending={pending} {...handlers} />);
  return handlers;
}

describe('CancelBookingDialog', () => {
  afterEach(cleanup);

  it('says the exact amount coming back, the percentage and what was paid', () => {
    renderDialog();

    const dialog = plain(screen.getByRole('dialog').textContent);
    expect(dialog).toContain('You will get 720,00 € back (75% of the 960,00 € you paid)');
    expect(dialog).toContain('Cancel booking BK-ABC1234567?');
  });

  it('puts the exact amount on the confirm button too, so nobody confirms blind', () => {
    renderDialog();

    expect(plain(screen.getByRole('button', { name: /^Cancel and refund/ }).textContent)).toBe('Cancel and refund 720,00 €');
  });

  it('puts the focus on keeping the booking, not on cancelling', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep my booking' }));
  });

  it('only cancels when the person presses the cancel button', async () => {
    const { onKeep, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /^Cancel and refund/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('keeps the booking when the person backs out', async () => {
    const { onKeep, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Keep my booking' }));

    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is blunt when nothing will be refunded', () => {
    renderDialog({ ...QUOTE, refundPercent: 0, refundCents: 0 });

    expect(screen.getByRole('dialog').textContent).toContain('You will not get any money back');
    expect(screen.getByRole('button', { name: 'Cancel without refund' })).toBeTruthy();
  });

  it('says "on the day" for a same-day cancellation and uses the singular for one day', () => {
    const { unmount } = render(
      <CancelBookingDialog open quote={{ ...QUOTE, daysBeforeCheckIn: 0 }} reference="BK-1" pending={false} onKeep={vi.fn<() => void>()} onConfirm={vi.fn<() => void>()} />,
    );
    expect(screen.getByRole('dialog').textContent).toContain('Cancelling now, on the day before check-in');
    unmount();

    render(
      <CancelBookingDialog open quote={{ ...QUOTE, daysBeforeCheckIn: 1 }} reference="BK-1" pending={false} onKeep={vi.fn<() => void>()} onConfirm={vi.fn<() => void>()} />,
    );
    expect(screen.getByRole('dialog').textContent).toContain('1 day before check-in');
  });

  it('disables both buttons while the cancellation is running', () => {
    renderDialog(QUOTE, true);

    expect(screen.getByRole('button', { name: 'Keep my booking' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancelling…' }).hasAttribute('disabled')).toBe(true);
  });
});
