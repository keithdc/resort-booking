// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/bulk-rate-warning-dialog.test.tsx
 * @feature property
 */

import type { BulkRatePeriodPreview, RatePeriodWrite } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BulkRateWarningDialog } from './bulk-rate-warning-dialog';

const WRITE: RatePeriodWrite = { label: 'Peak summer', startDate: '2027-07-01', endDate: '2027-08-31', nightlyRateCents: 26000 };

function preview(overrides: Partial<BulkRatePeriodPreview> = {}): BulkRatePeriodPreview {
  return {
    propertyId: 'p1',
    addCount: 1,
    conflictCount: 1,
    results: [
      { houseId: 'h1', houseName: 'Dune', status: 'will_add', conflict: null },
      { houseId: 'h2', houseName: 'Cedar', status: 'conflict', conflict: { label: 'Existing peak', startDate: '2027-07-15', endDate: '2027-07-20' } },
    ],
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Parameters<typeof BulkRateWarningDialog>[0]> = {}): { onCancel: () => void; onConfirm: () => void } {
  const onCancel = vi.fn<() => void>();
  const onConfirm = vi.fn<() => void>();
  render(
    <BulkRateWarningDialog preview={preview()} write={WRITE} currencyCode="EUR" pending={false} onCancel={onCancel} onConfirm={onConfirm} {...overrides} />,
  );
  return { onCancel, onConfirm };
}

describe('BulkRateWarningDialog', () => {
  afterEach(cleanup);

  it('warns how many houses change and names the period, dates and rate', () => {
    renderDialog();

    expect(screen.getByRole('dialog').textContent).toContain('Change the price of 2 stays at once?');
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert).toContain('Peak summer');
    expect(alert).toContain('2027-07-01 to 2027-08-31');
    expect(alert).toContain('1 stay');
  });

  it('lists every house that clashes and says it will be skipped, not overwritten', () => {
    renderDialog();

    const list = screen.getByRole('list', { name: 'Stays that will be skipped' });
    expect(list.textContent).toContain('Cedar clashes with "Existing peak" (2027-07-15 to 2027-07-20)');
    expect(screen.getByRole('dialog').textContent).toContain('Nothing is overwritten');
  });

  it('shows no skipped list when nothing clashes', () => {
    renderDialog({
      preview: preview({ addCount: 2, conflictCount: 0, results: [
        { houseId: 'h1', houseName: 'Dune', status: 'will_add', conflict: null },
        { houseId: 'h2', houseName: 'Cedar', status: 'will_add', conflict: null },
      ] }),
    });

    expect(screen.queryByRole('list', { name: 'Stays that will be skipped' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to 2 stays' })).toBeTruthy();
  });

  it('puts the focus on Cancel, not on the risky action', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('confirms only when the person presses the confirm button', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Add to 1 stay' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels without confirming', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('blocks confirming when every house clashes', () => {
    renderDialog({ preview: preview({ addCount: 0, conflictCount: 2 }) });

    expect(screen.getByRole('button', { name: 'Add to 0 stays' }).hasAttribute('disabled')).toBe(true);
  });

  it('disables both buttons while applying', () => {
    renderDialog({ pending: true });

    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Applying…' }).hasAttribute('disabled')).toBe(true);
  });
});
