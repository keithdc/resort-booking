/**
 * @file apps/api/src/shared/http/request-id.spec.ts
 * @shared Request id middleware
 */

import { requestIdMiddleware, resolveRequestId, type RequestIdCarrier } from './request-id';

function run(header: string | undefined): { request: RequestIdCarrier; headers: Record<string, string>; next: jest.Mock } {
  const headers: Record<string, string> = {};
  const request: RequestIdCarrier = { header: (): string | undefined => header };
  const response = {
    setHeader: (name: string, value: string): void => {
      headers[name] = value;
    },
  };
  const next = jest.fn();
  requestIdMiddleware(request, response, next);
  return { request, headers, next };
}

describe('resolveRequestId', () => {
  it('keeps a safe caller-supplied id', () => {
    expect(resolveRequestId('abc12345-req_01.x')).toBe('abc12345-req_01.x');
  });

  it.each([undefined, '', 'short', 'has space in it', 'new\nline-injected', 'x'.repeat(65), '<script>alert(1)</script>'])(
    'replaces an unusable id (%s) with a fresh UUID',
    (incoming) => {
      expect(resolveRequestId(incoming)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    },
  );
});

describe('requestIdMiddleware', () => {
  it('stores the id on the request, echoes it in the response header and continues', () => {
    const { request, headers, next } = run('abc12345-req');

    expect(request.requestId).toBe('abc12345-req');
    expect(headers['x-request-id']).toBe('abc12345-req');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('makes an id when none was sent', () => {
    const { request, headers } = run(undefined);

    expect(request.requestId).toBeDefined();
    expect(headers['x-request-id']).toBe(request.requestId);
  });
});
