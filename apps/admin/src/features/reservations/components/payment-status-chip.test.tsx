// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/payment-status-chip.test.tsx
 * @feature reservations
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaymentStatusChip } from './payment-status-chip';

afterEach(cleanup);

describe('PaymentStatusChip', () => {
  it('shows the pending pay-at-hotel warning with words (not colour alone)', () => {
    render(<PaymentStatusChip stay={{ paymentMethod: 'pay_at_hotel', paymentStatus: 'pending' }} />);

    expect(screen.getByText('Pay at hotel · Pending')).toBeTruthy();
  });

  it('shows "Paid at hotel" after the tick', () => {
    render(<PaymentStatusChip stay={{ paymentMethod: 'pay_at_hotel', paymentStatus: 'paid' }} />);

    expect(screen.getByText('Paid at hotel')).toBeTruthy();
  });

  it('shows nothing for an online booking in a list, and "Paid" on the booking card', () => {
    const { container, rerender } = render(<PaymentStatusChip stay={{ paymentMethod: 'card', paymentStatus: 'paid' }} />);
    expect(container.textContent).toBe('');

    rerender(<PaymentStatusChip stay={{ paymentMethod: 'card', paymentStatus: 'paid' }} showPaid />);
    expect(screen.getByText('Paid')).toBeTruthy();
  });
});
