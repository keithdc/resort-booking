// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/refunds/components/mark-refund-paid-dialog.test.tsx
 * @feature refunds
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffRefund } from '@/test/fixtures';
import { MarkRefundPaidDialog } from './mark-refund-paid-dialog';

const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s/g, ' ');

function renderDialog(overrides: { saving?: boolean; error?: string | null } = {}): { onClose: () => void; onConfirm: (note: string) => void } {
  const handlers = { onClose: vi.fn<() => void>(), onConfirm: vi.fn<(note: string) => void>() };
  render(<MarkRefundPaidDialog open refund={staffRefund()} saving={overrides.saving ?? false} error={overrides.error ?? null} {...handlers} />);
  return handlers;
}

describe('MarkRefundPaidDialog', () => {
  afterEach(cleanup);

  it('names the amount and says when to use it', () => {
    renderDialog();

    const dialog = plain(screen.getByRole('dialog').textContent);
    expect(dialog).toContain('Mark 720,00 € as refunded?');
    expect(dialog).toContain('Use this after you have sent the money yourself');
    expect(dialog).toContain('BK-ABC1234567');
  });

  it('puts the focus on "Not yet", so nothing is marked by accident', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Not yet' }));
  });

  it('needs a real note before it can confirm, and says the note is kept with the staff name', () => {
    renderDialog();
    const confirm = screen.getByRole('button', { name: /^Yes, I sent/ });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Kept on the record with your name/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/How and when/), { target: { value: 'ab' } });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/at least 3 characters/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/How and when/), { target: { value: 'Bank transfer 3 June' } });
    expect(confirm.hasAttribute('disabled')).toBe(false);
  });

  it('puts the exact amount on the confirm button and sends the note', async () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByLabelText(/How and when/), { target: { value: 'Bank transfer 3 June' } });

    await userEvent.click(screen.getByRole('button', { name: /^Yes, I sent/ }));

    expect(onConfirm).toHaveBeenCalledWith('Bank transfer 3 June');
    expect(plain(screen.getByRole('button', { name: /^Yes, I sent/ }).textContent)).toBe('Yes, I sent 720,00 €');
  });

  it('shows the API message when the last attempt failed', () => {
    renderDialog({ error: 'This refund is already settled.' });

    expect(screen.getByText('This refund is already settled.')).toBeTruthy();
  });

  it('disables both buttons while saving', () => {
    renderDialog({ saving: true });

    expect(screen.getByRole('button', { name: 'Not yet' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true);
  });

  it('closes without confirming on "Not yet"', async () => {
    const { onClose, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
