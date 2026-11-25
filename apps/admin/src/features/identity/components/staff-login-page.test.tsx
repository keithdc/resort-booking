// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/identity/components/staff-login-page.test.tsx
 * @feature identity
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { StaffLoginPage } from './staff-login-page';

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), next: null as string | null }));
const api = vi.hoisted(() => ({
  loginStaff: vi.fn<(email: string, password: string) => Promise<{ token: string }>>(),
  persistStaffSession: vi.fn<(token: string) => Promise<void>>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: typeof nav.replace; refresh: typeof nav.refresh } => ({ replace: nav.replace, refresh: nav.refresh }),
  useSearchParams: (): { get: (key: string) => string | null } => ({ get: (): string | null => nav.next }),
}));
vi.mock('../services/staff-identity-api', () => ({ loginStaff: api.loginStaff }));
vi.mock('@/shared/services/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/services/api-client')>()),
  persistStaffSession: api.persistStaffSession,
}));
vi.mock('@resort-booking/ui/contact', () => ({
  isValidEmail: (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  EmailField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element => (
    <input aria-label={label} value={value} onChange={(event): void => onChange(event.target.value)} />
  ),
}));

describe('StaffLoginPage', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.refresh.mockReset();
    nav.next = null;
    api.loginStaff.mockReset();
    api.persistStaffSession.mockReset();
    api.persistStaffSession.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('shows the brand, the title and the form', () => {
    render(<StaffLoginPage />);

    expect(screen.getByText('Humphreys')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Staff sign in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('signs in, saves the session and goes home', async () => {
    api.loginStaff.mockResolvedValue({ token: 't1' });
    render(<StaffLoginPage />);

    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(api.persistStaffSession).toHaveBeenCalledWith('t1');
  });

  it('goes to the page it was asked for, but only inside the site', async () => {
    api.loginStaff.mockResolvedValue({ token: 't1' });
    nav.next = '/reports';
    const first = render(<StaffLoginPage />);
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/reports'));
    first.unmount();

    nav.replace.mockReset();
    nav.next = 'https://evil.example';
    render(<StaffLoginPage />);
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it('shows the API message when sign-in fails and stays on the page', async () => {
    api.loginStaff.mockRejectedValue(new ApiRequestError('Wrong email or password', 401));
    render(<StaffLoginPage />);

    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Wrong email or password')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
