/**
 * @file apps/api/src/shared/http/http-metrics.spec.ts
 * @shared Request counters and the periodic summary line
 */

import { HttpMetrics, startMetricsSummary } from './http-metrics';

describe('HttpMetrics', () => {
  it('counts by class and by the watched status codes', () => {
    const metrics = new HttpMetrics();

    for (const status of [200, 200, 201, 301, 401, 403, 404, 404, 429, 500, 503, 418]) {
      metrics.record(status, 5);
    }

    expect(metrics.takeWindow()).toEqual({
      total: 12,
      byClass: { '2xx': 3, '3xx': 1, '4xx': 6, '5xx': 2 },
      byStatus: { '401': 1, '403': 1, '404': 2, '429': 1, '500': 1, '503': 1 },
      guardDenied: 0,
    });
  });

  it('counts guard denials on their own', () => {
    const metrics = new HttpMetrics();

    metrics.recordGuardDenial();
    metrics.recordGuardDenial();

    expect(metrics.takeWindow()).toMatchObject({ total: 0, guardDenied: 2 });
  });

  it('hands out each window once and starts a fresh one; a quiet window is null', () => {
    const metrics = new HttpMetrics();
    metrics.record(200, 1);

    expect(metrics.takeWindow()?.total).toBe(1);
    expect(metrics.takeWindow()).toBeNull();
  });

  it('tells a sink about every finished request, until it is removed', () => {
    const metrics = new HttpMetrics();
    const seen: Array<[number, number]> = [];
    metrics.setSink((status, ms): void => {
      seen.push([status, ms]);
    });

    metrics.record(503, 12);
    metrics.setSink(null);
    metrics.record(200, 3);

    expect(seen).toEqual([[503, 12]]);
  });
});

describe('startMetricsSummary', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('logs one http.counters line per busy interval, none for a quiet one, and stops when told to', () => {
    const metrics = new HttpMetrics();
    const lines: string[] = [];
    const stop = startMetricsSummary((line): void => {
      lines.push(line);
    }, 60_000, metrics);

    metrics.record(500, 9);
    jest.advanceTimersByTime(60_000);
    jest.advanceTimersByTime(60_000);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^http\.counters \{/);
    expect(JSON.parse(lines[0]?.slice('http.counters '.length) ?? '{}')).toMatchObject({ windowSeconds: 60, total: 1, byStatus: { '500': 1 } });

    stop();
    metrics.record(500, 9);
    jest.advanceTimersByTime(120_000);
    expect(lines).toHaveLength(1);
  });
});
