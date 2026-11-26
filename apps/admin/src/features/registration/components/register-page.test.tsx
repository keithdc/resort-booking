// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/registration/components/register-page.test.tsx
 * @feature registration
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { RegisterPage } from './register-page';

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchRegistrationStatus: vi.fn<() => Promise<{ open: boolean }>>(),
  registerWorkspace: vi.fn<(body: object) => Promise<{ signedIn: true }>>(),
}));

vi.mock('next/navigation', () => ({ useRouter: (): typeof nav => nav }));
vi.mock('../services/registration-api', () => ({ fetchRegistrationStatus: api.fetchRegistrationStatus, registerWorkspace: api.registerWorkspace }));
vi.mock('@/features/configuration', async () => ({
  NewPasswordField: (await import('@/features/configuration/components/new-password-field')).NewPasswordField,
}));
vi.mock('@resort-booking/ui/contact', () => ({
  isValidEmail: (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  EmailField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element => (
    <input aria-label={label} value={value} onChange={(event): void => onChange(event.target.value)} />
  ),
}));

const GOOD = 'Correct-Horse-9';

async function fillForm(password = GOOD, confirm = GOOD): Promise<void> {
  fireEvent.change(await screen.findByLabelText(/Business name/), { target: { value: 'Atlantic Stays' } });
  fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Marie Dupont' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'marie@atlantic.example' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: confirm } });
}

describe('RegisterPage', () => {
  beforeEach(() => {
    for (const fn of [nav.replace, nav.refresh, ...Object.values(api)]) {
      fn.mockReset();
    }
    api.fetchRegistrationStatus.mockResolvedValue({ open: true });
  });
  afterEach(cleanup);

  it('shows a closed notice with a way back to sign in when registration is closed', async () => {
    api.fetchRegistrationStatus.mockResolvedValue({ open: false });

    render(<RegisterPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Registration is closed' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText(/Business name/)).toBeNull();
  });

  it('says it could not check when the status call fails', async () => {
    api.fetchRegistrationStatus.mockRejectedValue(new Error('offline'));

    render(<RegisterPage />);

    expect(await screen.findByText(/could not check whether registration is open/)).toBeTruthy();
  });

  it('shows the live password rules and keeps Create account off until everything is valid', async () => {
    render(<RegisterPage />);
    await fillForm('short', 'short');

    expect(screen.getByText(/password rules met/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    expect(screen.getByText('All password rules are met')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('tells the person when the confirmation does not match', async () => {
    render(<RegisterPage />);
    await fillForm(GOOD, 'Different-9-Pass');

    expect(screen.getByText('The passwords do not match')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('registers (the server sets the session cookie) and goes home', async () => {
    api.registerWorkspace.mockResolvedValue({ signedIn: true });
    render(<RegisterPage />);
    await fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(api.registerWorkspace).toHaveBeenCalledWith({ organizationName: 'Atlantic Stays', fullName: 'Marie Dupont', email: 'marie@atlantic.example', password: GOOD });
    // The page never handles a token: the BFF set the cookie.
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('shows the API message (email taken) and stays on the page', async () => {
    api.registerWorkspace.mockRejectedValue(new ApiRequestError('An account with this email already exists. Sign in instead.', 409, { code: 'EMAIL_TAKEN' }));
    render(<RegisterPage />);
    await fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('links back to sign in', async () => {
    render(<RegisterPage />);
    await screen.findByLabelText(/Business name/);

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  });
});
