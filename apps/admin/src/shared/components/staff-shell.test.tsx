// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/components/staff-shell.test.tsx
 * @shared Staff navigation
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffShell } from './staff-shell';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: (): string => navigation.pathname,
  useRouter: (): { replace: () => void; refresh: () => void } => ({ replace: (): void => undefined, refresh: (): void => undefined }),
}));
vi.mock('@/features/identity/services/staff-identity-api', () => ({ logoutStaff: (): Promise<void> => Promise.resolve() }));

describe('StaffShell navigation', () => {
  afterEach(cleanup);

  it('has a Refunds link between Account and Reports', () => {
    navigation.pathname = '/';

    render(<StaffShell>content</StaffShell>);

    expect(screen.getByRole('link', { name: /Refunds/ }).getAttribute('href')).toBe('/refunds');
    const labels = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(labels).toEqual(['/', '/properties', '/configuration', '/refunds', '/reports']);
  });

  it('marks Refunds as the current page on the refunds route', () => {
    navigation.pathname = '/refunds';

    render(<StaffShell>content</StaffShell>);

    expect(screen.getByRole('link', { name: /Refunds/ }).className).toContain('Mui-selected');
    expect(screen.getByRole('link', { name: /Calendar/ }).className).not.toContain('Mui-selected');
  });

  it('keeps the other links as they were', () => {
    navigation.pathname = '/';

    render(<StaffShell>content</StaffShell>);

    expect(screen.getByRole('link', { name: /Calendar/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Properties/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Account/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Reports/ })).toBeTruthy();
  });

  it('shows no chrome on the login page', () => {
    navigation.pathname = '/login';

    render(<StaffShell>just the login</StaffShell>);

    expect(screen.getByText('just the login')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Refunds/ })).toBeNull();
  });
});
