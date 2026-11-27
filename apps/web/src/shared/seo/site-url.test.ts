/**
 * @file apps/web/src/shared/seo/site-url.test.ts
 * @shared Public site address rules
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { absoluteUrl, propertyPath, siteUrl, stayPath } from './site-url';

describe('siteUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the configured address, dropping a path, query and trailing slash', () => {
    vi.stubEnv('SITE_URL', 'https://www.example.com/some/path/?x=1');
    expect(siteUrl()).toBe('https://www.example.com');
  });

  it('prefers the run-time SITE_URL over the build-time one', () => {
    vi.stubEnv('SITE_URL', 'https://runtime.example.com');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://build.example.com');
    expect(siteUrl()).toBe('https://runtime.example.com');
  });

  it('refuses anything that is not an http(s) address', () => {
    vi.stubEnv('SITE_URL', 'javascript:alert(1)');
    expect(siteUrl()).toBeNull();
    vi.stubEnv('SITE_URL', 'not a url');
    expect(siteUrl()).toBeNull();
  });

  it('is null in production when nothing is set, so localhost is never advertised', () => {
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(siteUrl()).toBeNull();
    expect(absoluteUrl('/properties')).toBeNull();
  });

  it('falls back to localhost only in development', () => {
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(siteUrl()).toBe('http://localhost:3000');
  });
});

describe('paths', () => {
  it('builds absolute addresses and encodes slugs', () => {
    vi.stubEnv('SITE_URL', 'https://www.example.com');
    expect(absoluteUrl('/x')).toBe('https://www.example.com/x');
    expect(absoluteUrl('x')).toBe('https://www.example.com/x');
    expect(propertyPath('a b')).toBe('/properties/a%20b');
    expect(stayPath('alpine-lake', 'lake/chalet')).toBe('/properties/alpine-lake/stays/lake%2Fchalet');
    vi.unstubAllEnvs();
  });
});
