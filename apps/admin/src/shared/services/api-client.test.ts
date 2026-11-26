// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/services/api-client.test.ts
 * @shared Staff API client in the browser: same-origin BFF only, no token in page code (S-11)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, clearStaffSession, getStaffApiOk, mutateStaffApiOk, postStaffLogin, publicApiUrl } from './api-client';

const assign = vi.fn();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api-client in the browser', () => {
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

  it('calls the same-origin proxy with no token header and no API origin: the cookie travels by itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { status: 'ok', data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await getStaffApiOk('/staff/me');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/proxy/staff/me');
    expect(init.credentials).toBe('same-origin');
    expect(Object.keys(init.headers as Record<string, string>).map((name: string): string => name.toLowerCase())).not.toContain('x-staff-token');
  });

  it('sends JSON bodies for mutations through the proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { status: 'ok', data: null }));
    vi.stubGlobal('fetch', fetchMock);

    await mutateStaffApiOk('/staff/me/password', 'POST', { a: 1 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/proxy/staff/me/password');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('sends public sign-in calls through the proxy too, and the answer never carries a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { status: 'ok', data: { signedIn: true, staff: { id: 's1' } } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await postStaffLogin<{ signedIn: true }>('a@b.example', 'pw');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/proxy/staff/login');
    expect(result.signedIn).toBe(true);
    expect(JSON.stringify(result)).not.toContain('token');
    await expect(publicApiUrl('/staff/register/status')).resolves.toBe('/api/proxy/staff/register/status');
  });

  it('goes to the login page and asks the server to drop the cookie when the session is refused (401)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { status: 'error', message: 'Staff authentication required' }))
      .mockResolvedValue(json(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStaffApiOk('/staff/me')).rejects.toBeInstanceOf(ApiRequestError);

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { status: 'error', message: 'Current password is wrong', code: 'STAFF_PASSWORD_MISMATCH' })),
    );

    await expect(mutateStaffApiOk('/staff/me/password', 'POST', {})).rejects.toMatchObject({ status: 401, code: 'STAFF_PASSWORD_MISMATCH' });

    expect(assign).not.toHaveBeenCalled();
  });

  it('does not sign anyone out for a wrong two-factor code (401 TWO_FACTOR_CODE_INVALID)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { status: 'error', message: 'That code is not valid', code: 'TWO_FACTOR_CODE_INVALID' })),
    );

    await expect(mutateStaffApiOk('/staff/me/two-factor/enable', 'POST', {})).rejects.toMatchObject({ status: 401, code: 'TWO_FACTOR_CODE_INVALID' });

    expect(assign).not.toHaveBeenCalled();
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { status: 'error', message: 'Conflict' })));

    await expect(getStaffApiOk('/staff/x')).rejects.toBeInstanceOf(ApiRequestError);

    expect(assign).not.toHaveBeenCalled();
  });

  it('clearing the session only asks the server to drop the cookie, and touches no storage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await clearStaffSession();

    expect(fetchMock).toHaveBeenCalledWith('/api/session', { method: 'DELETE' });
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
  });
});
