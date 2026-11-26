/**
 * @file apps/api/src/shared/http/url-length.middleware.spec.ts
 * @shared URL length guard
 */

import { MAX_URL_LENGTH, urlLengthMiddleware } from './url-length.middleware';

function run(url: string): { status: number | null; body: unknown; next: jest.Mock } {
  const out: { status: number | null; body: unknown } = { status: null, body: null };
  const response = {
    status: (code: number) => {
      out.status = code;
      return { json: (body: unknown): void => { out.body = body; } };
    },
  };
  const next = jest.fn();
  urlLengthMiddleware({ originalUrl: url }, response, next);
  return { ...out, next };
}

describe('urlLengthMiddleware', () => {
  it('passes a normal URL on', () => {
    const result = run('/search?checkIn=2027-07-10&checkOut=2027-07-12');

    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.status).toBeNull();
  });

  it('passes a URL of exactly the limit', () => {
    expect(run('/' + 'a'.repeat(MAX_URL_LENGTH - 1)).next).toHaveBeenCalledTimes(1);
  });

  it('answers 414 in the standard error shape for a longer one, and goes no further', () => {
    const result = run('/' + 'a'.repeat(MAX_URL_LENGTH));

    expect(result.status).toBe(414);
    expect(result.body).toEqual({ status: 'error', message: 'The address is too long', code: 'URL_TOO_LONG' });
    expect(result.next).not.toHaveBeenCalled();
  });
});
