/**
 * @file apps/api/src/shared/http/security-headers.middleware.ts
 * @shared Small security headers for every answer, and no caching of private data (no helmet dependency)
 * @dependencies none
 */

/** Answers under these prefixes carry personal or financial data and must never be stored by a cache or the browser. */
export const NO_STORE_PREFIXES: readonly string[] = ['/staff', '/bookings', '/holds', '/payments'];

export interface HeaderRequestLike {
  originalUrl?: string | undefined;
  url?: string | undefined;
}

export interface HeaderResponseLike {
  setHeader(name: string, value: string): unknown;
}

/**
 * True when the path is one of the prefixes or below it ("/staff" and "/staff/me", not "/staffing").
 */
export function isNoStorePath(path: string): boolean {
  return NO_STORE_PREFIXES.some((prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Express middleware (docs/13 R2-15): `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` on everything,
 * a locked-down `Content-Security-Policy` (an API answers JSON, never a page), and `Cache-Control: no-store` on the
 * staff, booking, hold and payment routes, so a CDN or the browser's back button cannot show signed-out data.
 */
export function securityHeadersMiddleware(request: HeaderRequestLike, response: HeaderResponseLike, next: () => void): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  const path = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
  if (isNoStorePath(path)) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
  }
  next();
}
