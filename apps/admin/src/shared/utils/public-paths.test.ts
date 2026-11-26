/**
 * @file apps/admin/src/shared/utils/public-paths.test.ts
 * @shared
 */

import { describe, expect, it } from 'vitest';
import { isBarePath, isPublicPath } from './public-paths';

describe('isPublicPath', () => {
  it('lets sign in, register, invitations and the session route through', () => {
    for (const path of ['/login', '/register', '/invite/abc123', '/api/session', '/api/proxy/staff/me']) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it('keeps every other page behind the session', () => {
    for (const path of ['/', '/team', '/audit', '/reports', '/invitees', '/registered', '/login-help', '/invite', '/api/proxying']) {
      expect(isPublicPath(path), path).toBe(path === '/invite');
    }
  });
});

describe('isBarePath', () => {
  it('is true for the sign-in family only', () => {
    expect(isBarePath('/login')).toBe(true);
    expect(isBarePath('/register')).toBe(true);
    expect(isBarePath('/invite/abc')).toBe(true);
    expect(isBarePath('/api/session')).toBe(false);
    expect(isBarePath('/team')).toBe(false);
  });
});
