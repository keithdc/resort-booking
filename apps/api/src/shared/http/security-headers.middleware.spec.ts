/**
 * @file apps/api/src/shared/http/security-headers.middleware.spec.ts
 * @shared Security headers and no-store on private routes
 */

import { isNoStorePath, securityHeadersMiddleware } from './security-headers.middleware';

function run(url: string): { headers: Record<string, string>; next: jest.Mock } {
  const headers: Record<string, string> = {};
  const next = jest.fn();
  securityHeadersMiddleware({ originalUrl: url }, { setHeader: (name: string, value: string): void => { headers[name] = value; } }, next);
  return { headers, next };
}

describe('securityHeadersMiddleware', () => {
  it('sets nosniff, no referrer and a locked-down CSP on every answer and carries on', () => {
    const { headers, next } = run('/properties');

    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each(['/staff/me', '/staff/refunds?x=1', '/bookings/lookup', '/holds/abc', '/payments/abc/mock/complete', '/payments/webhooks/mock', '/staff'])(
    'forbids caching on %s',
    (url) => {
      expect(run(url).headers['Cache-Control']).toBe('no-store');
    },
  );

  it.each(['/properties', '/houses', '/health', '/staffing', '/identity/organization'])('does not touch caching on %s', (url) => {
    expect(run(url).headers['Cache-Control']).toBeUndefined();
  });

  it('matches whole path segments only', () => {
    expect(isNoStorePath('/staffing')).toBe(false);
    expect(isNoStorePath('/holdsx')).toBe(false);
    expect(isNoStorePath('/staff/')).toBe(true);
  });
});
