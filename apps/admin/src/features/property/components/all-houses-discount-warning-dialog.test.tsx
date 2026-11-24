// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/all-houses-discount-warning-dialog.test.tsx
 * @feature property
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllHousesDiscountWarningDialog } from './all-houses-discount-warning-dialog';

function renderDialog(pending = false): { onCancel: () => void; onConfirm: () => void } {
  const onCancel = vi.fn<() => void>();
  const onConfirm = vi.fn<() => void>();
  render(
    <AllHousesDiscountWarningDialog label="Long stay" effectText="10%" pending={pending} onCancel={onCancel} onConfirm={onConfirm} />,
  );
  return { onCancel, onConfirm };
}

describe('AllHousesDiscountWarningDialog', () => {
  afterEach(cleanup);

  it('warns that the discount will apply to every house, naming it and its size', () => {
    renderDialog();

    expect(screen.getByRole('dialog').textContent).toContain('Apply this discount to every stay?');
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert).toContain('Long stay');
    expect(alert).toContain('10% off');
    expect(alert).toContain('every stay at this property');
  });

  it('puts the focus on Cancel, not on the risky action', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('confirms only when the person presses the confirm button', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Apply to all stays' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels without confirming', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables both buttons while applying', () => {
    renderDialog(true);

    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Applying…' }).hasAttribute('disabled')).toBe(true);
  });
});
