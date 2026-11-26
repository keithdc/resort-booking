// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/account/components/signed-in-devices.test.tsx
 * @feature account
 */

import type { StaffSessionInfo } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { SignedInDevices } from './signed-in-devices';

const api = vi.hoisted(() => ({
  fetchSignedInDevices: vi.fn<() => Promise<StaffSessionInfo[]>>(),
  signOutDevice: vi.fn<(id: string) => Promise<{ revoked: true }>>(),
  signOutOtherDevices: vi.fn<() => Promise<{ sessionsEnded: number }>>(),
}));
vi.mock('../services/signed-in-devices-api', () => api);

const NOW = new Date().toISOString();
const HERE: StaffSessionInfo = { id: 'a', deviceLabel: 'Chrome on macOS', createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW, current: true };
const PHONE: StaffSessionInfo = { id: 'b', deviceLabel: 'Safari on iPhone', createdAt: NOW, lastUsedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), expiresAt: NOW, current: false };

describe('SignedInDevices', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchSignedInDevices.mockResolvedValue([HERE, PHONE]);
    api.signOutDevice.mockResolvedValue({ revoked: true });
    api.signOutOtherDevices.mockResolvedValue({ sessionsEnded: 1 });
  });
  afterEach(cleanup);

  it('lists the devices, marks this one and offers Sign out only for the others', async () => {
    render(<SignedInDevices />);

    expect(await screen.findByText('Chrome on macOS')).toBeTruthy();
    expect(screen.getByText('This device')).toBeTruthy();
    expect(screen.getByText('Safari on iPhone')).toBeTruthy();
    expect(screen.getByText('Last active: 3 hours ago')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Sign out \w+ on / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sign out Safari on iPhone' })).toBeTruthy();
  });

  it('asks before signing one device out, then signs it out and reloads', async () => {
    render(<SignedInDevices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Sign out Safari on iPhone?')).toBeTruthy();
    expect(api.signOutDevice).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(api.signOutDevice).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(api.fetchSignedInDevices).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Device signed out')).toBeTruthy();
  });

  it('signs out all other devices after a confirmation', async () => {
    render(<SignedInDevices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(api.signOutOtherDevices).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('1 other device signed out')).toBeTruthy();
  });

  it('cancelling the confirmation changes nothing', async () => {
    render(<SignedInDevices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(api.signOutOtherDevices).not.toHaveBeenCalled();
  });

  it('disables "Sign out all other devices" when this is the only device', async () => {
    api.fetchSignedInDevices.mockResolvedValue([HERE]);
    render(<SignedInDevices />);

    await screen.findByText('Chrome on macOS');
    expect((screen.getByRole('button', { name: 'Sign out all other devices' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the error inside the dialog when sign-out fails, and keeps it open', async () => {
    api.signOutDevice.mockRejectedValue(new ApiRequestError('Session not found', 404));
    render(<SignedInDevices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Session not found')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows a calm error when the list cannot load, and an empty state for none', async () => {
    api.fetchSignedInDevices.mockRejectedValueOnce(new ApiRequestError('Down', 500));
    const first = render(<SignedInDevices />);
    expect(await screen.findByText('Down')).toBeTruthy();
    first.unmount();

    api.fetchSignedInDevices.mockResolvedValue([]);
    render(<SignedInDevices />);
    expect(await screen.findByText('No signed-in devices found.')).toBeTruthy();
  });
});
