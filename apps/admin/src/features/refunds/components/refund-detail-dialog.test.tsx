// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/refunds/components/refund-detail-dialog.test.tsx
 * @feature refunds
 */

import type { StaffRefund } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffRefund } from '@/test/fixtures';
import { RefundDetailDialog } from './refund-detail-dialog';

const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s/g, ' ');

function renderDialog(refund: StaffRefund | null, overrides: { busy?: boolean; error?: string | null } = {}): {
  onClose: () => void;
  onRetry: (refund: StaffRefund) => void;
  onMarkPaid: (refund: StaffRefund) => void;
} {
  const handlers = {
    onClose: vi.fn<() => void>(),
    onRetry: vi.fn<(refund: StaffRefund) => void>(),
    onMarkPaid: vi.fn<(refund: StaffRefund) => void>(),
  };
  render(<RefundDetailDialog refund={refund} busy={overrides.busy ?? false} error={overrides.error ?? null} {...handlers} />);
  return handlers;
}

describe('RefundDetailDialog', () => {
  afterEach(cleanup);

  it('renders nothing when no refund is open', () => {
    renderDialog(null);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows everything about the refund', () => {
    renderDialog(staffRefund({ reason: 'goodwill', initiatedBy: 'staff' }));

    const dialog = plain(screen.getByRole('dialog').textContent);
    expect(dialog).toContain('720,00 € · BK-ABC1234567');
    expect(dialog).toContain('Pending');
    expect(dialog).toContain('Ada Lovelace (ada@example.com)');
    expect(dialog).toContain('Lake Chalet, Alpine Lake');
    expect(dialog).toContain('Cancellation refund');
    expect(dialog).toContain('720,00 € (75%)');
    expect(dialog).toContain('Goodwill');
    expect(dialog).toContain('staff');
    expect(dialog).toContain('1 Jun 2027, 09:00 UTC');
  });

  it('explains a hand refund and offers only "Mark as refunded"', async () => {
    const { onMarkPaid } = renderDialog(staffRefund({ provider: 'manual', status: 'pending' }));

    expect(screen.getByText(/has to be sent by hand/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as refunded…' }));
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
  });

  it('offers Retry for a failed refund and shows why it failed', async () => {
    const { onRetry } = renderDialog(staffRefund({ status: 'failed', provider: 'mock', failureReason: 'card_closed' }));

    expect(screen.getByText(/could not send this refund: card_closed/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Mark as refunded…' })).toBeTruthy();
  });

  it('offers Retry for a pending provider refund', () => {
    renderDialog(staffRefund({ status: 'pending', provider: 'mock' }));

    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('offers no actions for a refund that is done, and shows who resolved it', () => {
    renderDialog(staffRefund({ status: 'succeeded', provider: 'manual', resolvedByName: 'Marie', resolutionNote: 'Bank transfer 3 June' }));

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as refunded…' })).toBeNull();
    expect(screen.getByText('Marked as sent by Marie: Bank transfer 3 June')).toBeTruthy();
  });

  it('shows the API message when an action failed', () => {
    renderDialog(staffRefund({ status: 'failed', provider: 'mock' }), { error: 'This refund cannot be retried.' });

    expect(screen.getByText('This refund cannot be retried.')).toBeTruthy();
  });

  it('disables the actions while one is running', () => {
    renderDialog(staffRefund({ status: 'failed', provider: 'mock' }), { busy: true });

    expect(screen.getByRole('button', { name: 'Working…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Mark as refunded…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Close' }).hasAttribute('disabled')).toBe(true);
  });
});
