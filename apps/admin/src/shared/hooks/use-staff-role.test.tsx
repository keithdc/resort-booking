// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/hooks/use-staff-role.test.tsx
 * @shared Role hook used to hide admin-only actions
 */

import type { StaffAccount } from '@resort-booking/shared-types';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanManageRefunds, useIsAdmin, useStaffAccount, useStaffRole } from './use-staff-role';

const account = vi.hoisted(() => ({ fetchStaffAccount: vi.fn<() => Promise<StaffAccount>>() }));
vi.mock('@/shared/services/staff-account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/services/staff-account')>()),
  fetchStaffAccount: account.fetchStaffAccount,
}));

const ME: StaffAccount = { id: 's1', organizationId: 'o1', fullName: 'Marie', email: 'm@x.example', role: 'admin', organizationName: 'Org', canManageRefunds: true };

describe('useStaffRole / useIsAdmin', () => {
  beforeEach(() => {
    account.fetchStaffAccount.mockReset();
  });
  afterEach(cleanup);

  it('is null (and not admin) while loading', () => {
    account.fetchStaffAccount.mockReturnValue(new Promise<StaffAccount>(() => undefined));

    expect(renderHook(() => useStaffRole()).result.current).toBeNull();
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false);
  });

  it('reports an admin', async () => {
    account.fetchStaffAccount.mockResolvedValue(ME);

    const { result } = renderHook(() => useIsAdmin());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reports an employee as not admin', async () => {
    account.fetchStaffAccount.mockResolvedValue({ ...ME, role: 'employee' });

    const { result } = renderHook(() => useStaffRole());

    await waitFor(() => expect(result.current).toBe('employee'));
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false);
  });

  it('stays not admin when the account cannot be read', async () => {
    account.fetchStaffAccount.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useIsAdmin());

    await waitFor(() => expect(account.fetchStaffAccount).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});

describe('useCanManageRefunds (money access drives the Refunds page, cancel and change-dates dialogs)', () => {
  beforeEach(() => {
    account.fetchStaffAccount.mockReset();
  });
  afterEach(cleanup);

  it('is false while loading', () => {
    account.fetchStaffAccount.mockReturnValue(new Promise<StaffAccount>(() => undefined));

    expect(renderHook(() => useCanManageRefunds()).result.current).toBe(false);
    expect(renderHook(() => useStaffAccount()).result.current).toBeNull();
  });

  it('is true for an admin, even if the stored flag were off', async () => {
    account.fetchStaffAccount.mockResolvedValue({ ...ME, canManageRefunds: false });

    const { result } = renderHook(() => useCanManageRefunds());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is true for an employee WITH the permission', async () => {
    account.fetchStaffAccount.mockResolvedValue({ ...ME, role: 'employee', canManageRefunds: true });

    const { result } = renderHook(() => useCanManageRefunds());

    await waitFor(() => expect(result.current).toBe(true));
    expect(renderHook(() => useIsAdmin()).result.current).toBe(false);
  });

  it('is false for an employee without it', async () => {
    account.fetchStaffAccount.mockResolvedValue({ ...ME, role: 'employee', canManageRefunds: false });

    const { result } = renderHook(() => useStaffAccount());

    await waitFor(() => expect(result.current?.role).toBe('employee'));
    expect(renderHook(() => useCanManageRefunds()).result.current).toBe(false);
  });

  it('stays false when the account cannot be read', async () => {
    account.fetchStaffAccount.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useCanManageRefunds());

    await waitFor(() => expect(account.fetchStaffAccount).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
