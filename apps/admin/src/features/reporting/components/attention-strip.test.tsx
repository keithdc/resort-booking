// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/attention-strip.test.tsx
 * @feature reporting
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttentionStrip } from './attention-strip';

const ZERO = { unpaidHoldCount: 0, refundsToPayCount: 0, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0 };

describe('AttentionStrip', () => {
  afterEach(cleanup);

  it('says nothing needs attention when all counts are zero', () => {
    render(<AttentionStrip attention={ZERO} currencyCode="EUR" onOpenTab={vi.fn()} />);

    expect(screen.getByText(/Nothing needs attention/)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists only items with something to do and links refunds to the refunds page', () => {
    render(<AttentionStrip attention={{ ...ZERO, refundsToPayCount: 2, refundsToPayCents: 15000 }} currencyCode="EUR" onOpenTab={vi.fn()} />);

    const link = screen.getByRole('link', { name: '2 refunds to pay' });
    expect(link.getAttribute('href')).toBe('/refunds');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/to send back/)).toBeTruthy();
  });

  it('opens the bookings tab for unpaid holds', () => {
    const onOpenTab = vi.fn();
    render(<AttentionStrip attention={{ ...ZERO, unpaidHoldCount: 3 }} currencyCode="EUR" onOpenTab={onOpenTab} />);

    fireEvent.click(screen.getByRole('button', { name: '3 unpaid holds' }));

    expect(onOpenTab).toHaveBeenCalledWith('bookings');
  });

  it('shows the section caption and a help icon per item', () => {
    render(<AttentionStrip attention={{ ...ZERO, arrivalsTodayCount: 1 }} currencyCode="EUR" onOpenTab={vi.fn()} />);

    expect(screen.getByText(/Things a person has to do today/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What does Arrivals today mean?' })).toBeTruthy();
  });
});
