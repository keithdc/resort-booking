// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/services/api-client.test.ts
 * @shared Staff API client session handling (S-11)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, getStaffApiOk, mutateStaffApiOk, persistStaffSession } from './api-client';
import { STAFF_TOKEN_STORAGE_KEY } from './staff-session';

const assign = vi.fn();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api-client session handling', () => {
  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal('location', { pathname: '/reports', assign });
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('sends the stored token in a header, never in the URL', async () => {
    window.localStorage.setItem(STAFF_TOKEN_STORAGE_KEY, 'secret-token');
    const fetchMock = vi.fn().mockResolvedValue(json(200, { status: 'ok', data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await getStaffApiOk('/staff/me');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('secret-token');
    expect((init.headers as Record<string, string>)['x-staff-token']).toBe('secret-token');
  });

  it('forgets the token and goes to the login page when the API answers 401', async () => {
    window.localStorage.setItem(STAFF_TOKEN_STORAGE_KEY, 'old');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { status: 'error', message: 'Staff authentication required' }))
      .mockResolvedValue(json(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffApiOk('/staff/me')).rejects.toBeInstanceOf(ApiRequestError);

    expect(window.localStorage.getItem(STAFF_TOKEN_STORAGE_KEY)).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login?reason=expired');
    expect(fetchMock).toHaveBeenCalledWith('/api/session', { method: 'DELETE' });
  });

  it('does not redirect in a loop when already on the login page', async () => {
    vi.stubGlobal('location', { pathname: '/login', assign });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { status: 'error', message: 'Nope' })));

    await expect(getStaffApiOk('/staff/me')).rejects.toBeInstanceOf(ApiRequestError);

    expect(assign).not.toHaveBeenCalled();
  });

  it('does not sign anyone out for a wrong current password (401 STAFF_PASSWORD_MISMATCH), and keeps the error code', async () => {
    window.localStorage.setItem(STAFF_TOKEN_STORAGE_KEY, 'keep');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { status: 'error', message: 'Current password is wrong', code: 'STAFF_PASSWORD_MISMATCH' })),
    );

    await expect(mutateStaffApiOk('/staff/me/password', 'POST', {})).rejects.toMatchObject({ status: 401, code: 'STAFF_PASSWORD_MISMATCH' });

    expect(assign).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STAFF_TOKEN_STORAGE_KEY)).toBe('keep');
  });

  it('does not sign anyone out for a wrong two-factor code (401 TWO_FACTOR_CODE_INVALID)', async () => {
    window.localStorage.setItem(STAFF_TOKEN_STORAGE_KEY, 'keep');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { status: 'error', message: 'That code is not valid', code: 'TWO_FACTOR_CODE_INVALID' })),
    );

    await expect(mutateStaffApiOk('/staff/me/two-factor/enable', 'POST', {})).rejects.toMatchObject({ status: 401, code: 'TWO_FACTOR_CODE_INVALID' });

    expect(assign).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STAFF_TOKEN_STORAGE_KEY)).toBe('keep');
  });

  it('carries the code and the list of problems of a weak password on the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(400, { status: 'error', message: 'Password is too weak', code: 'PASSWORD_TOO_WEAK', problems: ['Add a number', 'Add a capital letter'] }),
      ),
    );

    await expect(mutateStaffApiOk('/staff/me/password', 'POST', {})).rejects.toMatchObject({
      code: 'PASSWORD_TOO_WEAK',
      problems: ['Add a number', 'Add a capital letter'],
    });
  });

  it('ignores a problems field that is not a list of strings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { status: 'error', message: 'No', problems: [1, 2] })));

    await expect(mutateStaffApiOk('/staff/x', 'POST', {})).rejects.toMatchObject({ problems: [] });
  });

  it('does not end the session for other errors', async () => {
    window.localStorage.setItem(STAFF_TOKEN_STORAGE_KEY, 'keep');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { status: 'error', message: 'Conflict' })));

    await expect(getStaffApiOk('/staff/x')).rejects.toBeInstanceOf(ApiRequestError);

    expect(window.localStorage.getItem(STAFF_TOKEN_STORAGE_KEY)).toBe('keep');
    expect(assign).not.toHaveBeenCalled();
  });

  it('persists the session in storage and in the cookie route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await persistStaffSession('fresh');

    expect(window.localStorage.getItem(STAFF_TOKEN_STORAGE_KEY)).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledWith('/api/session', expect.objectContaining({ method: 'POST' }));
  });
});
