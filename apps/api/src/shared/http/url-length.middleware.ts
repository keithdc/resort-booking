/**
 * @file apps/api/src/shared/http/url-length.middleware.ts
 * @shared Refuses absurdly long URLs before routing
 * @dependencies none
 */

export const MAX_URL_LENGTH = 2048;

/** The part of a request the middleware reads. */
export interface UrlCarrier {
  originalUrl?: string | undefined;
  url?: string | undefined;
}

/** The part of a response the middleware writes. */
export interface JsonResponder {
  status(code: number): { json(body: unknown): unknown };
}

/**
 * Express middleware: a URL over 2048 characters is a 414 in the standard error shape. Nothing legitimate in
 * this API comes close; long URLs are scanners and fuzzers.
 */
export function urlLengthMiddleware(request: UrlCarrier, response: JsonResponder, next: () => void): void {
  const url = request.originalUrl ?? request.url ?? '';
  if (url.length > MAX_URL_LENGTH) {
    response.status(414).json({ status: 'error', message: 'The address is too long', code: 'URL_TOO_LONG' });
    return;
  }
  next();
}
