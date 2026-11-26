/**
 * @file apps/api/src/shared/http/access-log.spec.ts
 * @shared The access log line: what it carries and, above all, what it never carries
 */

import { accessLogMiddleware, routeTemplate, type AccessLogRequest, type AccessLogResponse, type AccessLogSink } from './access-log';
import { HttpMetrics } from './http-metrics';

interface Harness {
  lines: Array<{ level: 'log' | 'warn' | 'error'; text: string }>;
  metrics: HttpMetrics;
  run: (request: AccessLogRequest, status: number, elapsedMs?: number) => void;
}

function harness(): Harness {
  const lines: Harness['lines'] = [];
  const sink: AccessLogSink = {
    log: (text): void => {
      lines.push({ level: 'log', text });
    },
    warn: (text): void => {
      lines.push({ level: 'warn', text });
    },
    error: (text): void => {
      lines.push({ level: 'error', text });
    },
  };
  const metrics = new HttpMetrics();
  let clock = 1_000;
  const middleware = accessLogMiddleware(sink, metrics, () => clock);
  return {
    lines,
    metrics,
    run: (request, status, elapsedMs = 7): void => {
      let finish: () => void = () => undefined;
      const response: AccessLogResponse = {
        statusCode: status,
        once: (_event, listener): void => {
          finish = listener;
        },
      };
      let nexted = false;
      middleware(request, response, (): void => {
        nexted = true;
      });
      expect(nexted).toBe(true);
      clock += elapsedMs;
      finish();
    },
  };
}

function parse(text: string): Record<string, unknown> {
  return JSON.parse(text.slice('http '.length)) as Record<string, unknown>;
}

describe('routeTemplate', () => {
  it('is the declared route, with the controller prefix', () => {
    expect(routeTemplate({ method: 'GET', baseUrl: '', route: { path: '/properties/:slug' } })).toBe('/properties/:slug');
    expect(routeTemplate({ method: 'GET', baseUrl: '/api', route: { path: '/x' } })).toBe('/api/x');
  });

  it('is "unmatched" when no route matched, never the requested URL', () => {
    expect(routeTemplate({ method: 'GET' })).toBe('unmatched');
    expect(routeTemplate({ method: 'GET', route: { path: /regex/ } })).toBe('unmatched');
  });
});

describe('accessLogMiddleware', () => {
  it('logs method, route template, status, duration, request id, organization and role as one JSON object', () => {
    const { lines, run } = harness();

    run(
      { method: 'PATCH', route: { path: '/staff/me' }, requestId: 'req-12345678', staff: { organizationId: 'org-1', role: 'admin' } },
      200,
      42,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('log');
    expect(parse(lines[0]?.text ?? '')).toEqual({ event: 'http', method: 'PATCH', route: '/staff/me', status: 200, ms: 42, req: 'req-12345678', org: 'org-1', role: 'admin' });
  });

  it('uses null for what a public request does not have', () => {
    const { lines, run } = harness();

    run({ method: 'GET', route: { path: '/properties' } }, 200);

    expect(parse(lines[0]?.text ?? '')).toMatchObject({ req: null, org: null, role: null });
  });

  it('logs 4xx at warn and 5xx at error', () => {
    const { lines, run } = harness();

    run({ method: 'GET', route: { path: '/a' } }, 404);
    run({ method: 'GET', route: { path: '/a' } }, 429);
    run({ method: 'GET', route: { path: '/a' } }, 500);

    expect(lines.map((line) => line.level)).toEqual(['warn', 'warn', 'error']);
  });

  it('never logs a token, an email, a query string or an id from the URL: only the declared template', () => {
    const { lines, run } = harness();
    // What Express would hold for GET /staff/invites/SECRETTOKEN123/preview?email=ada@example.com
    const request: AccessLogRequest & { originalUrl: string; url: string; query: object; params: object; body: object; ip: string; headers: object } = {
      method: 'GET',
      route: { path: '/staff/invites/:token/preview' },
      baseUrl: '',
      originalUrl: '/staff/invites/SECRETTOKEN123/preview?email=ada@example.com',
      url: '/staff/invites/SECRETTOKEN123/preview?email=ada@example.com',
      query: { email: 'ada@example.com' },
      params: { token: 'SECRETTOKEN123' },
      body: { password: 'hunter2-hunter2' },
      ip: '203.0.113.9',
      headers: { authorization: 'Bearer abc', 'x-staff-token': 'tok' },
      requestId: 'req-12345678',
    };

    run(request, 404);

    const text = lines[0]?.text ?? '';
    for (const secret of ['SECRETTOKEN123', 'ada@example.com', 'hunter2', '203.0.113.9', 'Bearer', 'tok"']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('/staff/invites/:token/preview');
  });

  it('ignores a role or organization that is not a string', () => {
    const { lines, run } = harness();

    run({ method: 'GET', route: { path: '/a' }, staff: { organizationId: { evil: true }, role: 7 } }, 200);

    expect(parse(lines[0]?.text ?? '')).toMatchObject({ org: null, role: null });
  });

  it('counts every response, and only counts (does not log) a successful health check', () => {
    const { lines, metrics, run } = harness();

    run({ method: 'GET', route: { path: '/health' } }, 200);
    run({ method: 'GET', route: { path: '/health' } }, 503);
    run({ method: 'GET', route: { path: '/properties' } }, 200);

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => parse(line.text).status)).toEqual([503, 200]);
    expect(metrics.takeWindow()).toMatchObject({ total: 3, byStatus: { '503': 1 } });
  });
});
