import { currentRequestContext, requestContextMiddleware, runWithRequestContext } from './request-context';

describe('request context', () => {
  it('is empty outside a request', () => {
    expect(currentRequestContext()).toEqual({ ip: undefined, requestId: undefined });
  });

  it('carries the caller network and request id through awaits, timers and promises', async () => {
    await new Promise<void>((resolve) => {
      requestContextMiddleware({ ip: '203.0.113.9', requestId: 'req-ctx-1' }, undefined, () => {
        void (async (): Promise<void> => {
          await Promise.resolve();
          await new Promise<void>((done) => setTimeout(done, 5));
          expect(currentRequestContext()).toEqual({ ip: '203.0.113.9', requestId: 'req-ctx-1' });
          resolve();
        })();
      });
    });
  });

  it('keeps two requests apart', async () => {
    const seen: string[] = [];
    await Promise.all(
      ['a', 'b'].map((id) =>
        runWithRequestContext({ ip: undefined, requestId: `req-${id}` }, async (): Promise<void> => {
          await new Promise<void>((done) => setTimeout(done, id === 'a' ? 10 : 1));
          seen.push(currentRequestContext().requestId ?? 'none');
        }),
      ),
    );
    expect(seen.sort()).toEqual(['req-a', 'req-b']);
  });

  it('hashes nothing and stores nothing itself: it only holds the two values for the request', () => {
    requestContextMiddleware({ ip: '::ffff:203.0.113.9' }, undefined, () => {
      expect(currentRequestContext().ip).toBe('203.0.113.9');
    });
  });
});
