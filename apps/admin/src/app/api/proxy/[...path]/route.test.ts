// @vitest-environment node
/**
 * @file apps/admin/src/app/api/proxy/[...path]/route.test.ts
 * @shared The BFF proxy: allow-list, header stripping, 401 handling, same-origin refusal, body forwarding, sign-in cookie
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'ab'.repeat(32);
const NEW_TOKEN = 'cd'.repeat(32);
const HOST = 'admin.example.com';

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async (): Promise<{ get: (name: string) => { value: string } | undefined }> => ({
    get: (name: string): { value: string } | undefined => (name === 'staff_token' && jar.value !== undefined ? { value: jar.value } : undefined),
  }),
}));

import { DELETE, GET, PATCH, POST, PUT } from './route';

const fetchMock = vi.fn();

function call(
  handler: typeof GET,
  method: string,
  path: string,
  init: { body?: string; headers?: Record<string, string>; query?: string } = {},
): ReturnType<typeof GET> {
  const request = new NextRequest(`https://${HOST}/api/proxy/${path}${init.query ?? ''}`, {
    method,
    headers: { 'sec-fetch-site': 'same-origin', host: HOST, ...init.headers },
    ...(init.body === undefined ? {} : { body: init.body }),
  });
  return handler(request, { params: Promise.resolve({ path: path.split('/') }) });
}

function api(status: number, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

function sentTo(index = 0): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: init.headers as Headers };
}

beforeEach(() => {
  jar.value = TOKEN;
  fetchMock.mockReset().mockResolvedValue(api(200, { status: 'ok', data: { hello: 'world' } }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('API_URL', 'https://api.internal');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('same-origin enforcement', () => {
  it('refuses cross-site, wrong-origin and header-less requests before anything leaves this server', async () => {
    const crossSite = await call(POST, 'POST', 'staff/me/password', { headers: { 'sec-fetch-site': 'cross-site' }, body: '{}' });
    const wrongOrigin = await call(POST, 'POST', 'staff/me/password', { headers: { 'sec-fetch-site': '', origin: 'https://evil.example.net' }, body: '{}' });
    const bare = new NextRequest(`https://${HOST}/api/proxy/staff/me`, { method: 'GET' });
    const noHeaders = await GET(bare, { params: Promise.resolve({ path: ['staff', 'me'] }) });

    expect(crossSite.status).toBe(403);
    expect(wrongOrigin.status).toBe(403);
    expect(noHeaders.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(crossSite.headers.get('set-cookie')).toBeNull();
  });
});

describe('allow-list', () => {
  it('is not an open proxy: only /staff/*, never traversal or encoded tricks', async () => {
    for (const path of ['payments/webhooks/mock', 'health', 'staff', 'staff/../payments', 'staff/%2e%2e/health', 'identity/organization']) {
      const response = await call(GET, 'GET', path);
      expect(response.status, path).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an over-long query', async () => {
    expect((await call(GET, 'GET', 'staff/geocode', { query: `?q=${'a'.repeat(3000)}` })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('forwarding a signed-in request', () => {
  it('adds the cookie token as x-staff-token, forwards method, path, query and JSON body, and strips cookie and friends', async () => {
    await call(PATCH, 'PATCH', 'staff/properties/p1', {
      query: '?x=1',
      body: '{"name":"Lake"}',
      headers: {
        'content-type': 'application/json',
        cookie: `staff_token=${TOKEN}; other=1`,
        authorization: 'Bearer nope',
        origin: `https://${HOST}`,
        'x-staff-token': 'forged',
        connection: 'keep-alive',
        'user-agent': 'Mozilla/5.0 Test',
        'x-forwarded-for': '203.0.113.7',
      },
    });

    const { url, init, headers } = sentTo();
    expect(url).toBe('https://api.internal/staff/properties/p1?x=1');
    expect(init.method).toBe('PATCH');
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('{"name":"Lake"}');
    expect(headers.get('x-staff-token')).toBe(TOKEN);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('user-agent')).toBe('Mozilla/5.0 Test');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    for (const name of ['cookie', 'authorization', 'origin', 'connection', 'host', 'sec-fetch-site']) {
      expect(headers.get(name), name).toBeNull();
    }
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
  });

  it('handles every API method', async () => {
    for (const [handler, method] of [[GET, 'GET'], [POST, 'POST'], [PUT, 'PUT'], [PATCH, 'PATCH'], [DELETE, 'DELETE']] as const) {
      fetchMock.mockClear().mockImplementation(async (): Promise<Response> => api(200, { status: 'ok', data: null }));
      const response = await call(handler, method, 'staff/x1', method === 'GET' || method === 'DELETE' ? {} : { body: '{}', headers: { 'content-type': 'application/json' } });
      expect(response.status, method).toBe(200);
      expect(sentTo().init.method).toBe(method);
    }
  });

  it('relays status, content type, download name and body untouched (a CSV works), always no-store', async () => {
    fetchMock.mockResolvedValue(
      api(200, 'a,b\r\n1,2\r\n', {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="report.csv"',
        'set-cookie': 'evil=1',
        'access-control-allow-origin': '*',
      }),
    );

    const response = await call(GET, 'GET', 'staff/reports/export');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('a,b\r\n1,2\r\n');
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="report.csv"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('relays an API error body and status as they are (the UI shows the message and code)', async () => {
    fetchMock.mockResolvedValue(api(409, { status: 'error', message: 'Conflict', code: 'X' }));

    const response = await call(POST, 'POST', 'staff/x1', { body: '{}', headers: { 'content-type': 'application/json' } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: 'error', message: 'Conflict', code: 'X' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('relays Retry-After of a rate limit', async () => {
    fetchMock.mockResolvedValue(api(429, { status: 'error', message: 'Slow down' }, { 'content-type': 'application/json', 'retry-after': '30' }));

    expect((await call(GET, 'GET', 'staff/x1')).headers.get('retry-after')).toBe('30');
  });

  it('answers 204 without a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await call(DELETE, 'DELETE', 'staff/x1');

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});

describe('ended sessions', () => {
  it('answers 401 and clears the cookie, without calling the API, when there is no cookie or a junk cookie', async () => {
    for (const value of [undefined, 'junk', 'Z'.repeat(64)]) {
      jar.value = value;
      const response = await call(GET, 'GET', 'staff/me');
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'STAFF_UNAUTHORIZED' });
      expect(response.headers.get('set-cookie')).toMatch(/staff_token=;.*Max-Age=0/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relays the API 401 and clears the cookie, so the UI shows "session ended"', async () => {
    fetchMock.mockResolvedValue(api(401, { status: 'error', message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' }));

    const response = await call(GET, 'GET', 'staff/me');

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toMatch(/staff_token=;.*Max-Age=0/i);
  });

  it('keeps the cookie when the 401 only means a typed password or code was wrong', async () => {
    for (const code of ['STAFF_PASSWORD_MISMATCH', 'TWO_FACTOR_CODE_INVALID']) {
      fetchMock.mockResolvedValue(api(401, { status: 'error', message: 'No', code }));
      const response = await call(POST, 'POST', 'staff/me/password', { body: '{}', headers: { 'content-type': 'application/json' } });
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  });
});

describe('sign-in routes', () => {
  const body = JSON.stringify({ email: 'a@b.example', password: 'x'.repeat(12) });
  const json = { 'content-type': 'application/json' };
  const session = {
    status: 'ok',
    data: { token: NEW_TOKEN, expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(), staff: { id: 's1', role: 'admin' } },
  };

  it('puts the token in an httpOnly Secure cookie and returns the page NO token', async () => {
    jar.value = undefined;
    fetchMock.mockResolvedValue(api(200, session));

    const response = await call(POST, 'POST', 'staff/login', { body, headers: json });

    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`staff_token=${NEW_TOKEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Expires=/i);
    const text = await response.text();
    expect(text).not.toContain(NEW_TOKEN);
    expect(JSON.parse(text)).toEqual({ status: 'ok', data: { expiresAt: session.data.expiresAt, staff: session.data.staff, signedIn: true } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('sends no session header to the API for a sign-in, even when an old cookie exists', async () => {
    fetchMock.mockResolvedValue(api(200, session));

    await call(POST, 'POST', 'staff/login/two-factor', { body: '{"challengeToken":"c","code":"1"}', headers: json });

    expect(sentTo().url).toBe('https://api.internal/staff/login/two-factor');
    expect(sentTo().headers.get('x-staff-token')).toBeNull();
  });

  it('covers register and accept-invite the same way', async () => {
    for (const path of ['staff/register', 'staff/invites/accept']) {
      fetchMock.mockResolvedValue(api(201, session));
      const response = await call(POST, 'POST', path, { body: '{}', headers: json });
      expect(response.status, path).toBe(201);
      expect(response.headers.get('set-cookie') ?? '', path).toContain(`staff_token=${NEW_TOKEN}`);
      expect(await response.text(), path).not.toContain(NEW_TOKEN);
    }
  });

  it('passes a two-factor challenge through unchanged and sets no cookie', async () => {
    jar.value = undefined;
    const challenge = { status: 'ok', data: { twoFactorRequired: true, challengeToken: 'c'.repeat(64), expiresAt: '2030-01-01T00:00:00Z' } };
    fetchMock.mockResolvedValue(api(200, challenge));

    const response = await call(POST, 'POST', 'staff/login', { body, headers: json });

    expect(await response.json()).toEqual(challenge);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('passes a failed sign-in through (status, message) with no cookie change', async () => {
    fetchMock.mockResolvedValue(api(401, { status: 'error', message: 'Email or password is wrong', code: 'STAFF_LOGIN_FAILED' }));

    const response = await call(POST, 'POST', 'staff/login', { body, headers: json });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'STAFF_LOGIN_FAILED' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('never stores a token of the wrong shape', async () => {
    fetchMock.mockResolvedValue(api(200, { status: 'ok', data: { token: 'short', staff: {} } }));

    const response = await call(POST, 'POST', 'staff/login', { body, headers: json });

    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('wants JSON', async () => {
    const response = await call(POST, 'POST', 'staff/login', { body, headers: { 'content-type': 'text/plain' } });

    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the public reads (registration status, invitation preview) without a session', async () => {
    jar.value = undefined;
    fetchMock.mockResolvedValue(api(200, { status: 'ok', data: { open: true } }));

    const response = await call(GET, 'GET', 'staff/register/status');

    expect(response.status).toBe(200);
    expect(sentTo().headers.get('x-staff-token')).toBeNull();
  });
});

describe('sign-out', () => {
  it('revokes on the API with the cookie token and clears the cookie', async () => {
    fetchMock.mockResolvedValue(api(200, { status: 'ok', data: { loggedOut: true } }));

    const response = await call(POST, 'POST', 'staff/logout', { body: '{}', headers: { 'content-type': 'application/json' } });

    expect(sentTo().url).toBe('https://api.internal/staff/logout');
    expect(sentTo().headers.get('x-staff-token')).toBe(TOKEN);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/staff_token=;.*Max-Age=0/i);
  });

  it('clears the cookie even when the API cannot be reached, and says so', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const response = await call(POST, 'POST', 'staff/logout', { body: '{}', headers: { 'content-type': 'application/json' } });

    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toMatch(/staff_token=;.*Max-Age=0/i);
  });

  it('is a plain success without a cookie, and calls nothing', async () => {
    jar.value = undefined;

    const response = await call(POST, 'POST', 'staff/logout', { body: '{}', headers: { 'content-type': 'application/json' } });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('limits and failures', () => {
  it('refuses a body over 1 MiB, declared or not', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1);
    const declared = await call(POST, 'POST', 'staff/x1', { body: big, headers: { 'content-type': 'application/json', 'content-length': String(big.length) } });
    const undeclared = await call(POST, 'POST', 'staff/x1', { body: big, headers: { 'content-type': 'application/json' } });

    expect(declared.status).toBe(413);
    expect(undeclared.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an API answer over 10 MiB', async () => {
    fetchMock.mockResolvedValue(api(200, 'y'.repeat(10 * 1024 * 1024 + 1), { 'content-type': 'text/plain' }));

    expect((await call(GET, 'GET', 'staff/x1')).status).toBe(502);
  });

  it('answers 502 when the API is down and 504 on a timeout, with no detail leaked', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:3002'));
    const down = await call(GET, 'GET', 'staff/x1');
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    fetchMock.mockRejectedValueOnce(timeout);
    const slow = await call(GET, 'GET', 'staff/x1');

    expect(down.status).toBe(502);
    expect(slow.status).toBe(504);
    expect(JSON.stringify(await down.json())).not.toContain('10.0.0.5');
  });

  it('does not follow API redirects', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.example.net' } }));

    const response = await call(GET, 'GET', 'staff/x1');

    expect(response.headers.get('location')).toBeNull();
  });
});
