/**
 * @file apps/admin/src/features/identity/services/staff-identity-api.test.ts
 * @feature identity
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableTwoFactor,
  enableTwoFactor,
  fetchTwoFactorStatus,
  loginStaff,
  loginStaffTwoFactor,
  needsTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
} from './staff-identity-api';

const client = vi.hoisted(() => ({
  getStaffApiOk: vi.fn<(path: string) => Promise<unknown>>(),
  mutateStaffApiOk: vi.fn<(path: string, method: string, body?: unknown) => Promise<unknown>>(),
  postStaffLogin: vi.fn<(email: string, password: string) => Promise<unknown>>(),
  postStaffPublic: vi.fn<(path: string, body: unknown, message?: string) => Promise<unknown>>(),
}));

vi.mock('@/shared/services/api-client', () => client);

describe('staff identity api: two-factor', () => {
  beforeEach(() => {
    for (const fn of Object.values(client)) {
      fn.mockReset();
      fn.mockResolvedValue({});
    }
  });

  it('tells a challenge from a session', () => {
    expect(needsTwoFactor({ twoFactorRequired: true, challengeToken: 'x', expiresAt: 'y' })).toBe(true);
    expect(
      needsTwoFactor({ token: 't', expiresAt: 'y', staff: { id: '1', organizationId: 'o', fullName: 'A', email: 'a@b.c' } }),
    ).toBe(false);
  });

  it('signs in through the public login, and finishes through the public second step (no session header)', async () => {
    await loginStaff('a@b.c', 'pw');
    await loginStaffTwoFactor('c'.repeat(64), '123456');

    expect(client.postStaffLogin).toHaveBeenCalledWith('a@b.c', 'pw');
    expect(client.postStaffPublic).toHaveBeenCalledWith('/staff/login/two-factor', { challengeToken: 'c'.repeat(64), code: '123456' }, 'Could not sign in');
  });

  it('calls the account endpoints with the right method and body', async () => {
    await fetchTwoFactorStatus();
    await startTwoFactorSetup();
    await enableTwoFactor('123456');
    await disableTwoFactor({ currentPassword: 'pw', code: '123456' });
    await regenerateRecoveryCodes({ currentPassword: 'pw', code: 'ABCDE-FGHJK' });

    expect(client.getStaffApiOk).toHaveBeenCalledWith('/staff/me/two-factor');
    expect(client.mutateStaffApiOk.mock.calls).toEqual([
      ['/staff/me/two-factor/setup', 'POST', {}],
      ['/staff/me/two-factor/enable', 'POST', { code: '123456' }],
      ['/staff/me/two-factor/disable', 'POST', { currentPassword: 'pw', code: '123456' }],
      ['/staff/me/two-factor/recovery-codes/regenerate', 'POST', { currentPassword: 'pw', code: 'ABCDE-FGHJK' }],
    ]);
  });
});
