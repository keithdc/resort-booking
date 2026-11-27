/**
 * @file apps/web/src/app/robots.test.ts
 * @shared robots.txt rules
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from './robots';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('robots', () => {
  it('lets crawlers in but keeps them out of the booking look-up, search results and date searches', () => {
    vi.stubEnv('SITE_URL', 'https://www.example.com');
    const result = robots();
    expect(result.rules).toEqual([{ userAgent: '*', allow: '/', disallow: ['/manage', '/search', '/*checkIn='] }]);
    expect(result.sitemap).toBe('https://www.example.com/sitemap.xml');
  });

  it('does not point to a sitemap when the site address is not configured', () => {
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(robots().sitemap).toBeUndefined();
  });
});
