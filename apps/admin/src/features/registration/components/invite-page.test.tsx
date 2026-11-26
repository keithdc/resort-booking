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
  acceptInvite: vi.fn<(body: object) => Promise<{ token: string }>>(),
  persistStaffSession: vi.fn<(token: string) => Promise<void>>(),
}));

vi.mock('next/navigation', () => ({ useRouter: (): typeof nav => nav }));
vi.mock('../services/registration-api', () => ({ fetchInvitePreview: api.fetchInvitePreview, acceptInvite: api.acceptInvite }));
vi.mock('@/shared/services/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/services/api-client')>()),
  persistStaffSession: api.persistStaffSession,
}));
vi.mock('@/features/configuration', async () => ({
  NewPasswordField: (await import('@/features/configuration/components/new-password-field')).NewPasswordField,
}));

const TOKEN = 'a'.repeat(64);
const GOOD = 'Correct-Horse-9';
const PREVIEW: InvitePreview = { organizationName: 'Atlantic Stays', email: 'paul@atlantic.example', role: 'employee' };

describe('InvitePage', () => {
  beforeEach(() => {
    for (const fn of [nav.replace, nav.refresh, ...Object.values(api)]) {
      fn.mockReset();
    }
    api.fetchInvitePreview.mockResolvedValue(PREVIEW);
    api.persistStaffSession.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('previews the workspace, the email and the role', async () => {
    render(<InvitePage token={TOKEN} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' })).toBeTruthy();
    expect(screen.getByText('paul@atlantic.example')).toBeTruthy();
    expect(screen.getByText('Employee')).toBeTruthy();
    expect(api.fetchInvitePreview).toHaveBeenCalledWith(TOKEN);
  });

  it('shows a friendly page for an invalid, expired or used link (404)', async () => {
    api.fetchInvitePreview.mockRejectedValue(new ApiRequestError('This link is not valid any more.', 404, { code: 'INVITE_INVALID' }));

    render(<InvitePage token={TOKEN} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'This link is not valid' })).toBeTruthy();
    expect(screen.getByText(/Ask your admin to send you a new one/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('shows a plain error (not the invalid page) when the server cannot be reached', async () => {
    api.fetchInvitePreview.mockRejectedValue(new ApiRequestError('Service unavailable', 503));

    render(<InvitePage token={TOKEN} />);

    expect(await screen.findByText('Service unavailable')).toBeTruthy();
    expect(screen.queryByText('This link is not valid')).toBeNull();
  });

  it('needs a policy-passing password that is confirmed before it accepts', async () => {
    render(<InvitePage token={TOKEN} />);
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

  it('accepts, signs in with the returned session and goes home (name sent only when typed)', async () => {
    api.acceptInvite.mockResolvedValue({ token: 'tok-9' });
    render(<InvitePage token={TOKEN} />);
    await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(api.acceptInvite).toHaveBeenCalledWith({ token: TOKEN, password: GOOD });
    expect(api.persistStaffSession).toHaveBeenCalledWith('tok-9');
  });

  it('sends the typed name', async () => {
    api.acceptInvite.mockResolvedValue({ token: 'tok-9' });
    render(<InvitePage token={TOKEN} />);
    await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' });

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Paul Martin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(api.acceptInvite).toHaveBeenCalledWith({ token: TOKEN, password: GOOD, fullName: 'Paul Martin' }));
  });

  it('switches to the invalid page when the link was used in the meantime', async () => {
    api.acceptInvite.mockRejectedValue(new ApiRequestError('This link is not valid any more.', 404, { code: 'INVITE_INVALID' }));
    render(<InvitePage token={TOKEN} />);
    await screen.findByRole('heading', { level: 1, name: 'Join Atlantic Stays' });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'This link is not valid' })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
