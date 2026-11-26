/**
 * @file apps/api/src/shared/http/http-metrics.ts
 * @shared In-process request counters and the periodic summary line alerts can watch (docs/13 R2-24)
 * @dependencies none
 */

/** The status codes worth their own counter: each one is a different kind of trouble. */
const WATCHED_STATUSES: readonly number[] = [401, 403, 404, 429, 500, 502, 503];

/** What the counters hold. All plain numbers: nothing about who asked or what they asked for. */
export interface HttpMetricsSnapshot {
  total: number;
  /** 2xx, 3xx, 4xx, 5xx. */
  byClass: Record<string, number>;
  /** Only the watched codes (401, 403, 404, 429, 500, 502, 503). */
  byStatus: Record<string, number>;
  /** Requests a role or tenant guard turned away (403 FORBIDDEN_ROLE, tenant 404). */
  guardDenied: number;
}

/** A place to send each finished request, for a real metrics backend later (Prometheus, StatsD, ...). */
export type HttpMetricsSink = (status: number, durationMs: number) => void;

/**
 * Counters for finished requests and guard denials. Per process and in memory (nothing durable); `takeWindow` returns what
 * happened since the last call so a summary line can say "in the last minute".
 */
export class HttpMetrics {
  private counts = HttpMetrics.empty();
  private sink: HttpMetricsSink | null = null;

  private static empty(): HttpMetricsSnapshot {
    return { total: 0, byClass: {}, byStatus: {}, guardDenied: 0 };
  }

  /** Counts one finished request. */
  public record(status: number, durationMs: number): void {
    this.counts.total += 1;
    const statusClass = `${String(Math.floor(status / 100))}xx`;
    this.counts.byClass[statusClass] = (this.counts.byClass[statusClass] ?? 0) + 1;
    if (WATCHED_STATUSES.includes(status)) {
      this.counts.byStatus[String(status)] = (this.counts.byStatus[String(status)] ?? 0) + 1;
    }
    this.sink?.(status, durationMs);
  }

  /** Counts one request turned away by a role or tenant guard. */
  public recordGuardDenial(): void {
    this.counts.guardDenied += 1;
  }

  /** Registers (or, with null, removes) the hook that sees every finished request. */
  public setSink(sink: HttpMetricsSink | null): void {
    this.sink = sink;
  }

  /** The counts since the last call, and a fresh start. Null when nothing happened (so a quiet minute logs nothing). */
  public takeWindow(): HttpMetricsSnapshot | null {
    const window = this.counts;
    this.counts = HttpMetrics.empty();
    return window.total === 0 && window.guardDenied === 0 ? null : window;
  }
}

/** The one set of counters for this process. */
export const httpMetrics = new HttpMetrics();

/**
 * Logs `http.counters {...}` for each interval in which something happened, so an alert can match on 5xx, 429 or guard
 * denials without a metrics stack. The timer does not keep the process alive. Returns a function that stops it.
 */
export function startMetricsSummary(log: (line: string) => void, intervalMs: number = 60_000, metrics: HttpMetrics = httpMetrics): () => void {
  const timer = setInterval((): void => {
    const window = metrics.takeWindow();
    if (window !== null) {
      log(`http.counters ${JSON.stringify({ windowSeconds: Math.round(intervalMs / 1000), ...window })}`);
    }
  }, intervalMs);
  timer.unref();
  return (): void => {
    clearInterval(timer);
  };
}
