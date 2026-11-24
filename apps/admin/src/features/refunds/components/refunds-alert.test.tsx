// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/refunds/components/refunds-alert.test.tsx
 * @feature refunds
 */

import type { StaffRefund } from '@resort-booking/shared-types';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { staffRefund } from '@/test/fixtures';
import type { RefundListStatus } from '../services/staff-refunds-api';
import { RefundsAlert } from './refunds-alert';

const api = vi.hoisted(() => ({
  fetchStaffRefunds: vi.fn<(status: RefundListStatus, propertyId: string) => Promise<StaffRefund[]>>(),
}));

vi.mock('../services/staff-refunds-api', () => api);

describe('RefundsAlert', () => {
  beforeEach(() => {
    api.fetchStaffRefunds.mockReset();
  });

  afterEach(cleanup);

  it('says how many refunds need attention and links to the refunds page', async () => {
    api.fetchStaffRefunds.mockResolvedValue([staffRefund({ id: 'a' }), staffRefund({ id: 'b' }), staffRefund({ id: 'c' })]);

    render(<RefundsAlert />);

    expect(await screen.findByText('3 refunds need your attention')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open refunds' }).getAttribute('href')).toBe('/refunds');
    expect(api.fetchStaffRefunds).toHaveBeenCalledWith('needs_attention', '');
  });

  it('uses the singular for one refund', async () => {
    api.fetchStaffRefunds.mockResolvedValue([staffRefund()]);

    render(<RefundsAlert />);

    expect(await screen.findByText('1 refund needs your attention')).toBeTruthy();
  });

  it('shows nothing when nothing needs attention', async () => {
    api.fetchStaffRefunds.mockResolvedValue([]);

    const { container } = render(<RefundsAlert />);

    await waitFor(() => expect(api.fetchStaffRefunds).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows nothing, and never breaks the page, when the count cannot be loaded', async () => {
    api.fetchStaffRefunds.mockRejectedValue(new Error('offline'));

    const { container } = render(<RefundsAlert />);

    await waitFor(() => expect(api.fetchStaffRefunds).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
