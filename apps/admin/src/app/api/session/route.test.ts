// @vitest-environment node
/**
 * @file apps/admin/src/app/api/session/route.test.ts
 * @shared The session cookie route: it can only CLEAR the cookie, same-origin only
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as route from './route';

const HOST = 'admin.example.com';

describe('/api/session', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exports nothing that could SET the cookie from a browser-supplied token (S-11)', () => {
    expect(Object.keys(route).sort()).toEqual(['DELETE']);
  });

  it('clears the cookie with the same flags for a same-origin request', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const request = new Request(`https://${HOST}/api/session`, { method: 'DELETE', headers: { origin: `https://${HOST}`, host: HOST } });

    const response = route.DELETE(request);

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('staff_token=;');
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a cross-site sign-out', () => {
    const request = new Request(`https://${HOST}/api/session`, { method: 'DELETE', headers: { 'sec-fetch-site': 'cross-site', host: HOST } });

    const response = route.DELETE(request);

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
