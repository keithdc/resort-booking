// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/identity/components/staff-login-page.test.tsx
 * @feature identity
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { StaffLoginPage } from './staff-login-page';

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), next: null as string | null, reason: null as string | null }));
const api = vi.hoisted(() => ({
  loginStaff: vi.fn<(email: string, password: string) => Promise<{ signedIn: true } | { twoFactorRequired: true; challengeToken: string; expiresAt: string }>>(),
  loginStaffTwoFactor: vi.fn<(challengeToken: string, code: string) => Promise<{ signedIn: true }>>(),
  clearStaffSession: vi.fn<() => Promise<void>>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: typeof nav.replace; refresh: typeof nav.refresh } => ({ replace: nav.replace, refresh: nav.refresh }),
  useSearchParams: (): { get: (key: string) => string | null } => ({ get: (key: string): string | null => (key === 'reason' ? nav.reason : nav.next) }),
}));
vi.mock('../services/staff-identity-api', () => ({
  loginStaff: api.loginStaff,
  loginStaffTwoFactor: api.loginStaffTwoFactor,
  needsTwoFactor: (outcome: object): boolean => 'twoFactorRequired' in outcome,
}));
vi.mock('@/shared/services/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/services/api-client')>()),
  clearStaffSession: api.clearStaffSession,
}));
vi.mock('@/features/registration', () => ({ RegistrationLink: (): null => null }));
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
    nav.reason = null;
    api.loginStaff.mockReset();
    api.loginStaffTwoFactor.mockReset();
    api.clearStaffSession.mockReset();
    api.clearStaffSession.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('shows the brand, the title and the form', () => {
    render(<StaffLoginPage />);

    expect(screen.getByText('Humphreys')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Staff sign in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('does not prefill a development login (S-02)', () => {
    render(<StaffLoginPage />);

    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
  });

  it('signs in, saves the session and goes home', async () => {
    api.loginStaff.mockResolvedValue({ signedIn: true });
    render(<StaffLoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    // The page never sees a token: the server already set the cookie.
  });

  it('goes to the page it was asked for, but only inside the site', async () => {
    api.loginStaff.mockResolvedValue({ signedIn: true });
    nav.next = '/reports';
    const first = render(<StaffLoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/reports'));
    first.unmount();

    nav.replace.mockReset();
    nav.next = 'https://evil.example';
    render(<StaffLoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it.each(['//evil.example', '/\\evil.example'])('does not follow the open redirect %s', async (target) => {
    api.loginStaff.mockResolvedValue({ signedIn: true });
    nav.next = target;
    render(<StaffLoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it.each([
    ['idle', /signed out after 30 minutes/],
    ['expired', /session ended/],
  ])('explains why the user is back on the login page (%s)', (reason, text) => {
    nav.reason = reason;
    render(<StaffLoginPage />);

    expect(screen.getByText(text)).toBeTruthy();
  });

  it('drops the stale session when the user was sent here because it ended', () => {
    nav.reason = 'expired';
    render(<StaffLoginPage />);

    expect(api.clearStaffSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the session alone when the user simply opened the login page', () => {
    render(<StaffLoginPage />);

    expect(api.clearStaffSession).not.toHaveBeenCalled();
  });

  it('shows no notice for an unknown reason', () => {
    nav.reason = 'whatever';
    render(<StaffLoginPage />);

    expect(screen.queryByText(/signed out after/)).toBeNull();
    expect(screen.queryByText(/session ended/)).toBeNull();
  });

  it('shows the API message when sign-in fails and stays on the page', async () => {
    api.loginStaff.mockRejectedValue(new ApiRequestError('Wrong email or password', 401));
    render(<StaffLoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Wrong email or password')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  describe('two-step verification', () => {
    const CHALLENGE = { twoFactorRequired: true as const, challengeToken: 'c'.repeat(64), expiresAt: '2027-01-01T00:05:00.000Z' };

    async function toSecondStep(): Promise<void> {
      api.loginStaff.mockResolvedValue(CHALLENGE);
      render(<StaffLoginPage />);
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
      fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'Secret123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await screen.findByRole('heading', { level: 1, name: 'Two-step verification' });
    }

    it('asks for a code instead of opening a session when the account has two-factor', async () => {
      await toSecondStep();

      expect(nav.replace).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/Authentication code/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Verify and sign in' }).hasAttribute('disabled')).toBe(true);
    });

    it('signs in with the code, saves the session and goes where it was asked', async () => {
      nav.next = '/reports';
      api.loginStaffTwoFactor.mockResolvedValue({ signedIn: true });
      await toSecondStep();

      fireEvent.change(screen.getByLabelText(/Authentication code/), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/reports'));
      expect(api.loginStaffTwoFactor).toHaveBeenCalledWith(CHALLENGE.challengeToken, '123456');
    });

    it('lets the person use a recovery code instead, and switch back', async () => {
      api.loginStaffTwoFactor.mockResolvedValue({ signedIn: true });
      await toSecondStep();

      fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));
      expect(screen.getByLabelText(/Recovery code/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Use an authenticator code' })).toBeTruthy();

      fireEvent.change(screen.getByLabelText(/Recovery code/), { target: { value: 'ABCDE-FGHJK' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

      await waitFor(() => expect(nav.replace).toHaveBeenCalled());
      expect(api.loginStaffTwoFactor).toHaveBeenCalledWith(CHALLENGE.challengeToken, 'ABCDE-FGHJK');
    });

    it('shows a wrong code on the same step, clears the field and keeps the challenge', async () => {
      api.loginStaffTwoFactor.mockRejectedValue(new ApiRequestError('That code is not valid', 401, { code: 'TWO_FACTOR_CODE_INVALID' }));
      await toSecondStep();

      fireEvent.change(screen.getByLabelText(/Authentication code/), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

      expect(await screen.findByText('That code is not valid')).toBeTruthy();
      expect((screen.getByLabelText(/Authentication code/) as HTMLInputElement).value).toBe('');
      expect(nav.replace).not.toHaveBeenCalled();
    });

    it('shows the rate limit message without leaving the step', async () => {
      api.loginStaffTwoFactor.mockRejectedValue(new ApiRequestError('Too many wrong codes. Please wait a few minutes.', 429, { code: 'TWO_FACTOR_RATE_LIMITED' }));
      await toSecondStep();

      fireEvent.change(screen.getByLabelText(/Authentication code/), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

      expect(await screen.findByText(/Too many wrong codes/)).toBeTruthy();
      expect(screen.getByLabelText(/Authentication code/)).toBeTruthy();
    });

    it('returns to the password step with a message when the challenge has expired or was used up', async () => {
      api.loginStaffTwoFactor.mockRejectedValue(new ApiRequestError('This sign-in has expired. Start again.', 401, { code: 'TWO_FACTOR_CHALLENGE_INVALID' }));
      await toSecondStep();

      fireEvent.change(screen.getByLabelText(/Authentication code/), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

      expect(await screen.findByText('This sign-in has expired. Start again.')).toBeTruthy();
      expect(screen.getByRole('heading', { level: 1, name: 'Staff sign in' })).toBeTruthy();
      expect((screen.getByLabelText(/Password/) as HTMLInputElement).value).toBe('');
    });

    it('has a back link that returns to sign in and forgets the typed password', async () => {
      await toSecondStep();

      fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));

      expect(screen.getByRole('heading', { level: 1, name: 'Staff sign in' })).toBeTruthy();
      expect((screen.getByLabelText(/Password/) as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('staff@example.test');
    });
  });
});
