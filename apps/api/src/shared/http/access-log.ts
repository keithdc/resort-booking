/**
 * @file apps/api/src/shared/http/access-log.ts
 * @shared One structured log line per request, without personal data (docs/13 R2-24)
 * @dependencies HttpMetrics
 */

import { httpMetrics, type HttpMetrics } from './http-metrics';

/** The part of a request the access log reads. */
export interface AccessLogRequest {
  method: string;
  baseUrl?: string | undefined;
  route?: { path?: unknown } | undefined;
  requestId?: string | undefined;
  /** Set by StaffGuard on staff routes. */
  staff?: { organizationId?: unknown; role?: unknown } | undefined;
}

/** The part of a response the access log reads. */
export interface AccessLogResponse {
  statusCode: number;
  once(event: 'finish', listener: () => void): unknown;
}

/** Where the line goes, by severity. */
export interface AccessLogSink {
  log(line: string): void;
  warn(line: string): void;
  error(line: string): void;
}

/**
 * The route as declared (`/staff/invites/:token/preview`), never the URL as requested: no query string, no token, no
 * email, no id from the path. A request that matched no route is "unmatched".
 */
export function routeTemplate(request: AccessLogRequest): string {
  const path = request.route?.path;
  return typeof path === 'string' ? `${request.baseUrl ?? ''}${path}` : 'unmatched';
}

/**
 * Express middleware: when the response finishes, logs
 * `http {"event":"http","method","route","status","ms","req","org","role"}` and counts it. Level: 5xx error, 4xx warn,
 * the rest log. Bodies, query strings, headers, IPs, emails and tokens are not read. Successful health checks are only
 * counted (a load balancer calls them every few seconds).
 */
export function accessLogMiddleware(
  sink: AccessLogSink,
  metrics: HttpMetrics = httpMetrics,
  now: () => number = Date.now,
): (request: AccessLogRequest, response: AccessLogResponse, next: () => void) => void {
  return (request, response, next): void => {
    const started = now();
    response.once('finish', (): void => {
      const durationMs = now() - started;
      const status = response.statusCode;
      metrics.record(status, durationMs);
      const route = routeTemplate(request);
      if (status < 400 && route === '/health') {
        return;
      }
      const organization = request.staff?.organizationId;
      const role = request.staff?.role;
      const line = `http ${JSON.stringify({
        event: 'http',
        method: request.method,
        route,
        status,
        ms: durationMs,
        req: request.requestId ?? null,
        org: typeof organization === 'string' ? organization : null,
        role: typeof role === 'string' ? role : null,
      })}`;
      if (status >= 500) {
        sink.error(line);
      } else if (status >= 400) {
        sink.warn(line);
      } else {
        sink.log(line);
      }
    });
    next();
  };
}
