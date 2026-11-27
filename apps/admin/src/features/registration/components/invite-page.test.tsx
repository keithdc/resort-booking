// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/registration/components/invite-page.test.tsx
 * @feature registration
 */

import type { InvitePreview } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { InvitePage } from './invite-page';

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchInvitePreview: vi.fn<(token: string) => Promise<InvitePreview>>(),
  acceptInvite: vi.fn<(body: object) => Promise<{ signedIn: true }>>(),
}));

vi.mock('next/navigation', () => ({ useRouter: (): typeof nav => nav }));
vi.mock('../services/registration-api', () => ({ fetchInvitePreview: api.fetchInvitePreview, acceptInvite: api.acceptInvite }));
vi.mock('@/features/configuration', async () => ({
  NewPasswordField: (await import('@/features/configuration/components/new-password-field')).NewPasswordField,
}));

const TOKEN = 'a'.repeat(64);
const GOOD = 'Correct-Horse-9';
const PREVIEW: InvitePreview = { organizationName: 'Atlantic Stays', email: 'paul@atlantic.example', role: 'employee', isReset: false };
const RESET_PREVIEW: InvitePreview = { ...PREVIEW, isReset: true };

describe('InvitePage', () => {
  beforeEach(() => {
    for (const fn of [nav.replace, nav.refresh, ...Object.values(api)]) {
      fn.mockReset();
    }
    api.fetchInvitePreview.mockResolvedValue(PREVIEW);
    window.history.replaceState(null, '', `/invite#token=${TOKEN}`);
  });
  afterEach(cleanup);

  it('previews the workspace, the email and the role', async () => {
    render(<InvitePage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' })).toBeTruthy();
    expect(screen.getByText('paul@atlantic.example')).toBeTruthy();
    expect(screen.getByText('Employee')).toBeTruthy();
    expect(api.fetchInvitePreview).toHaveBeenCalledWith(TOKEN);
  });

  it('takes the token out of the address bar as soon as it has read it', async () => {
    render(<InvitePage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' })).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/invite');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('still opens an older link with the token in the path, and removes it from the address bar', async () => {
    window.history.replaceState(null, '', `/invite/${TOKEN}`);
    render(<InvitePage legacyToken={TOKEN} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' })).toBeTruthy();
    expect(api.fetchInvitePreview).toHaveBeenCalledWith(TOKEN);
    expect(window.location.pathname).toBe('/invite');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it.each([
    ['no token at all', '/invite'],
    ['a token that is not 64 hex characters', '/invite#token=abc'],
    ['another fragment', '/invite#something=else'],
  ])('shows the "not valid" page without calling the API for %s', async (_label, address) => {
    window.history.replaceState(null, '', address);
    render(<InvitePage />);

    expect(await screen.findByText('This link is not valid')).toBeTruthy();
    expect(api.fetchInvitePreview).not.toHaveBeenCalled();
  });

  it('shows a friendly page for an invalid, expired or used link (404)', async () => {
    api.fetchInvitePreview.mockRejectedValue(new ApiRequestError('This link is not valid any more.', 404, { code: 'INVITE_INVALID' }));

    render(<InvitePage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'This link is not valid' })).toBeTruthy();
    expect(screen.getByText(/Ask your admin to send you a new one/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('shows a plain error (not the invalid page) when the server cannot be reached', async () => {
    api.fetchInvitePreview.mockRejectedValue(new ApiRequestError('Service unavailable', 503));

    render(<InvitePage />);

    expect(await screen.findByText('Service unavailable')).toBeTruthy();
    expect(screen.queryByText('This link is not valid')).toBeNull();
  });

  it('needs a policy-passing password that is confirmed before it accepts', async () => {
    render(<InvitePage />);
    await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' });
    const submit = screen.getByRole('button', { name: 'Accept invitation' }) as HTMLButtonElement;

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'weak' } });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/password rules met/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    expect(submit.disabled).toBe(false);
  });

  it('accepts (the server sets the session cookie) and goes home (name sent only when typed)', async () => {
    api.acceptInvite.mockResolvedValue({ signedIn: true });
    render(<InvitePage />);
    await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(api.acceptInvite).toHaveBeenCalledWith({ token: TOKEN, password: GOOD });
  });

  it('sends the typed name', async () => {
    api.acceptInvite.mockResolvedValue({ signedIn: true });
    render(<InvitePage />);
    await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' });

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Paul Martin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(api.acceptInvite).toHaveBeenCalledWith({ token: TOKEN, password: GOOD, fullName: 'Paul Martin' }));
  });

  it('switches to the invalid page when the link was used in the meantime', async () => {
    api.acceptInvite.mockRejectedValue(new ApiRequestError('This link is not valid any more.', 404, { code: 'INVITE_INVALID' }));
    render(<InvitePage />);
    await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'This link is not valid' })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  describe('access reset link', () => {
    beforeEach(() => {
      api.fetchInvitePreview.mockResolvedValue(RESET_PREVIEW);
    });

    it('shows only the email and the two password fields, with reset wording', async () => {
      render(<InvitePage />);

      expect(await screen.findByRole('heading', { level: 1, name: 'Reset your password' })).toBeTruthy();
      expect(screen.getByText('Choose a new password for your staff account.')).toBeTruthy();
      expect(screen.getByText('paul@atlantic.example')).toBeTruthy();
      expect(screen.getByLabelText('Password')).toBeTruthy();
      expect(screen.getByLabelText(/Confirm password/)).toBeTruthy();
      expect(screen.queryByLabelText('Your name')).toBeNull();
      expect(screen.queryByText(/Join /)).toBeNull();
      expect(screen.queryByText('Your role')).toBeNull();
      expect(screen.queryByText('Employee')).toBeNull();
      expect(screen.getByRole('button', { name: 'Set new password' })).toBeTruthy();
    });

    it('submits the password without any name', async () => {
      api.acceptInvite.mockResolvedValue({ signedIn: true });
      render(<InvitePage />);
      await screen.findByRole('heading', { level: 1, name: 'Reset your password' });

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
      fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
      fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));

      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
      expect(api.acceptInvite).toHaveBeenCalledWith({ token: TOKEN, password: GOOD });
    });
  });
});
