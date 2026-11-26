// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/components/admin-only.test.tsx
 * @shared Server guard for admin-only routes
 */

import type { StaffAccount } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { AdminOnly } from './admin-only';

const account = vi.hoisted(() => ({ fetchStaffAccount: vi.fn<() => Promise<StaffAccount>>() }));
vi.mock('@/shared/services/staff-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/services/staff-account')>()),
  fetchStaffAccount: account.fetchStaffAccount,
}));

const ADMIN: StaffAccount = { id: 's1', organizationId: 'o1', fullName: 'Marie', email: 'marie@x.example', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true };

async function renderGuard(): Promise<void> {
  render(await AdminOnly({ what: 'The team page', children: <p>secret admin page</p> }));
}

describe('AdminOnly', () => {
  beforeEach(() => {
    account.fetchStaffAccount.mockReset();
  });
  afterEach(cleanup);

  it('renders the page for an admin', async () => {
    account.fetchStaffAccount.mockResolvedValue(ADMIN);

    await renderGuard();

    expect(screen.getByText('secret admin page')).toBeTruthy();
  });

  it('shows the not-allowed page to an employee instead of the page', async () => {
    account.fetchStaffAccount.mockResolvedValue({ ...ADMIN, role: 'employee' });

    await renderGuard();

    expect(screen.queryByText('secret admin page')).toBeNull();
    expect(screen.getByText('Only admins can open this page')).toBeTruthy();
    expect(screen.getByText(/The team page is for workspace admins/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the calendar' }).getAttribute('href')).toBe('/');
  });

  it('shows the not-allowed page on a 403 rather than crashing', async () => {
    account.fetchStaffAccount.mockRejectedValue(new ApiRequestError('Forbidden', 403));

    await renderGuard();

    expect(screen.getByText('Only admins can open this page')).toBeTruthy();
  });

  it('lets other failures reach the route error boundary', async () => {
    account.fetchStaffAccount.mockRejectedValue(new ApiRequestError('Boom', 500));

    await expect(AdminOnly({ what: 'x', children: null })).rejects.toThrow('Boom');
  });
});
