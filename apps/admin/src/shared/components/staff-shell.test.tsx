// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/components/staff-shell.test.tsx
 * @shared Staff navigation and sidebar
 */

import type { StaffAccount, StaffRefund } from '@resort-booking/shared-types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { staffRefund } from '@/test/fixtures';
import { SIDEBAR_COLLAPSED_KEY } from '@/shared/hooks/use-sidebar-collapsed';
import { StaffShell } from './staff-shell';

const navigation = vi.hoisted(() => ({ pathname: '/', replace: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchStaffMe: vi.fn<() => Promise<StaffAccount>>(),
  logoutStaff: vi.fn<() => Promise<{ loggedOut: true }>>(),
  fetchStaffRefunds: vi.fn<(status: string, propertyId: string) => Promise<StaffRefund[]>>(),
  clearStaffSession: vi.fn<() => Promise<void>>(),
}));

vi.mock('next/navigation', () => ({
  usePathname: (): string => navigation.pathname,
  useRouter: (): { replace: typeof navigation.replace; refresh: typeof navigation.refresh } => ({
    replace: navigation.replace,
    refresh: navigation.refresh,
  }),
}));
vi.mock('@/features/identity/services/staff-identity-api', () => ({ logoutStaff: api.logoutStaff }));
vi.mock('@/shared/services/staff-account', () => ({ fetchStaffAccount: api.fetchStaffMe }));
vi.mock('@/features/refunds/services/staff-refunds-api', () => ({ fetchStaffRefunds: api.fetchStaffRefunds }));
vi.mock('@/shared/services/api-client', () => ({ clearStaffSession: api.clearStaffSession }));

const PROFILE: StaffAccount = {
  id: 's1',
  organizationId: 'o1',
  fullName: 'Marie Dupont',
  email: 'marie@humphreys.example',
  role: 'admin',
  organizationName: 'Humphreys',
  canManageRefunds: true,
};
const EMPLOYEE: StaffAccount = { ...PROFILE, id: 's2', fullName: 'Paul Martin', email: 'paul@humphreys.example', role: 'employee', canManageRefunds: false };

function refunds(count: number): StaffRefund[] {
  return Array.from({ length: count }, (_, index) => staffRefund({ id: `r${String(index)}` }));
}

function hrefs(): (string | null)[] {
  return within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));
}

describe('StaffShell sidebar', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    api.fetchStaffMe.mockResolvedValue(PROFILE);
    api.fetchStaffRefunds.mockResolvedValue([]);
    api.logoutStaff.mockResolvedValue({ loggedOut: true });
    api.clearStaffSession.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('groups the links: Operations, Insights, Setup', async () => {
    render(<StaffShell>content</StaffShell>);

    await waitFor(() => expect(hrefs()).toContain('/team'));
    expect(hrefs()).toEqual(['/', '/', '/refunds', '/reports', '/properties', '/team', '/audit', '/configuration']);
    for (const group of ['Operations', 'Insights', 'Setup']) {
      expect(screen.getByRole('region', { name: group })).toBeTruthy();
    }
    expect(screen.getByText('Admin')).toBeTruthy();
  });

  it('hides the admin-only links and shows an Employee chip for an employee', async () => {
    api.fetchStaffMe.mockResolvedValue(EMPLOYEE);

    render(<StaffShell>content</StaffShell>);

    expect(await screen.findByText('Employee')).toBeTruthy();
    expect(hrefs()).toEqual(['/', '/', '/refunds', '/reports', '/configuration']);
  });

  it('shows no admin-only link until the role is known, or when it cannot load', async () => {
    api.fetchStaffMe.mockRejectedValue(new Error('offline'));

    render(<StaffShell>content</StaffShell>);

    await waitFor(() => expect(api.fetchStaffMe).toHaveBeenCalled());
    expect(hrefs()).not.toContain('/team');
    expect(hrefs()).not.toContain('/audit');
    expect(hrefs()).not.toContain('/properties');
  });

  it('renders the register and invitation pages without the sidebar or any account call', () => {
    navigation.pathname = '/invite/abc';

    render(<StaffShell>invitation</StaffShell>);

    expect(screen.getByText('invitation')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(api.fetchStaffMe).not.toHaveBeenCalled();
  });

  it('marks the current page with aria-current and leaves the others unmarked', async () => {
    navigation.pathname = '/refunds';

    render(<StaffShell>content</StaffShell>);

    expect(screen.getByRole('link', { name: /Refunds/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Calendar/ }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: /Reports/ }).getAttribute('aria-current')).toBeNull();
    await waitFor(() => expect(api.fetchStaffMe).toHaveBeenCalled());
  });

  it('keeps Properties selected on a property page', async () => {
    navigation.pathname = '/properties/abc';

    render(<StaffShell>content</StaffShell>);

    expect((await screen.findByRole('link', { name: /Properties/ })).getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(api.fetchStaffMe).toHaveBeenCalled());
  });

  it('shows how many refunds are waiting, and reads it out', async () => {
    api.fetchStaffRefunds.mockResolvedValue(refunds(3));

    render(<StaffShell>content</StaffShell>);

    await waitFor(() => expect(screen.getByRole('link', { name: /Refunds, 3 waiting/ })).toBeTruthy());
    expect(api.fetchStaffRefunds).toHaveBeenCalledWith('needs_attention', '');
  });

  it('still works when the profile or refund count cannot load', async () => {
    api.fetchStaffMe.mockRejectedValue(new Error('offline'));
    api.fetchStaffRefunds.mockRejectedValue(new Error('offline'));

    render(<StaffShell>content</StaffShell>);

    await waitFor(() => expect(api.fetchStaffMe).toHaveBeenCalled());
    expect(screen.getByText('Signed in')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Refunds/ })).toBeTruthy();
    expect(screen.queryByText(/waiting/)).toBeNull();
  });

  it('shows who is signed in', async () => {
    render(<StaffShell>content</StaffShell>);

    expect(await screen.findByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('marie@humphreys.example')).toBeTruthy();
  });

  it('folds to an icon rail, hides the words, keeps links reachable, and remembers it', async () => {
    render(<StaffShell>content</StaffShell>);
    expect(screen.getByText('Who is staying')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(screen.queryByText('Who is staying')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('link', { name: /Calendar/ })).toBeTruthy();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    await waitFor(() => expect(api.fetchStaffMe).toHaveBeenCalled());
  });

  it('opens already folded when that was the saved choice', async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');

    render(<StaffShell>content</StaffShell>);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy());
  });

  it('gives a rail link a tooltip with its label and hint', async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');
    render(<StaffShell>content</StaffShell>);
    const link = await screen.findByRole('link', { name: /Refunds/ });

    await act(async () => {
      fireEvent.mouseOver(link);
    });

    expect(await screen.findByRole('tooltip')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toContain('Refunds · Money to send back');
  });

  it('signs out: ends the session, clears it, and returns to the login page', async () => {
    render(<StaffShell>content</StaffShell>);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login'));
    expect(api.logoutStaff).toHaveBeenCalled();
    expect(api.clearStaffSession).toHaveBeenCalled();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('signs out even when the server call fails', async () => {
    api.logoutStaff.mockRejectedValue(new Error('offline'));

    render(<StaffShell>content</StaffShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login'));
    expect(api.clearStaffSession).toHaveBeenCalled();
  });

  it('opens the same menu as a drawer from the top bar', async () => {
    render(<StaffShell>content</StaffShell>);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    // The open drawer hides the page behind it from assistive tech, so ask for hidden ones too.
    expect(await screen.findAllByRole('navigation', { name: 'Main', hidden: true })).toHaveLength(2);
  });

  it('shows no chrome on the login page and loads nothing', () => {
    navigation.pathname = '/login';

    render(<StaffShell>just the login</StaffShell>);

    expect(screen.getByText('just the login')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(api.fetchStaffMe).not.toHaveBeenCalled();
  });
});
