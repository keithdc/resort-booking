// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/refunds/components/refunds-compact.test.tsx
 * @feature refunds
 * Phone layout: refunds are cards that open the detail dialog.
 */

import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffRefund } from '@/test/fixtures';
import { RefundsPage } from './refunds-page';

vi.mock('@/shared/hooks/use-compact-layout', () => ({ useCompactLayout: (): boolean => true, usePhoneLayout: (): boolean => true }));
vi.mock('../services/staff-refunds-api', () => ({
  fetchStaffRefunds: (): Promise<unknown[]> =>
    Promise.resolve([staffRefund({ id: 'a', reference: 'BK-AAA0000000', bookerName: 'Ada Lovelace', status: 'pending', provider: 'manual' })]),
  retryStaffRefund: vi.fn(),
  markStaffRefundPaid: vi.fn(),
}));
vi.mock('@/features/property/services/staff-property-api', () => ({ fetchStaffProperties: (): Promise<unknown[]> => Promise.resolve([]) }));

describe('RefundsPage on a phone', () => {
  afterEach(cleanup);

  it('shows cards instead of a table and opens the refund on tap', async () => {
    render(<RefundsPage />);

    const list = within(await screen.findByRole('list', { name: 'Refunds' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(list.getByText('Ada Lovelace')).toBeTruthy();
    fireEvent.click(list.getByRole('button', { name: 'Open refund BK-AAA0000000' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
