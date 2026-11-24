/**
 * @file apps/admin/src/features/reporting/utils/report-chart.test.ts
 * @feature reporting
 */

import type { ReportSeriesPoint } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { buildChartSeries, MAX_DAILY_BUCKETS } from './report-chart';

function days(from: string, count: number, nightsPerDay = 1, revenue = 10000): ReportSeriesPoint[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_, index): ReportSeriesPoint => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    revenueCents: revenue,
    occupiedNights: nightsPerDay,
    stayCount: nightsPerDay,
    pendingCount: 0,
    cancelledCount: 0,
  }));
}

describe('buildChartSeries', () => {
  it('draws one bar per day for a month, with the share of stays booked that day', () => {
    const series = buildChartSeries(days('2027-07-01', 31, 1), 2);

    expect(series).toHaveLength(31);
    expect(series[0]).toMatchObject({ key: '2027-07-01', label: '1', title: '1 Jul 2027', occupancyPercent: 50, revenueCents: 10000 });
    expect(series[30]?.label).toBe('31');
  });

  it('draws one bar per month once the period is longer than 45 days', () => {
    const series = buildChartSeries(days('2027-01-01', 365, 1), 1);

    expect(series).toHaveLength(12);
    expect(series[0]).toMatchObject({ key: '2027-01', label: 'Jan', title: 'Jan 2027', occupiedNights: 31, revenueCents: 310000, occupancyPercent: 100 });
    expect(series[1]?.dates).toHaveLength(28);
  });

  it('keeps day drawing at exactly the limit and switches just past it', () => {
    expect(buildChartSeries(days('2027-01-01', MAX_DAILY_BUCKETS), 1)).toHaveLength(MAX_DAILY_BUCKETS);
    expect(buildChartSeries(days('2027-01-01', MAX_DAILY_BUCKETS + 1), 1).length).toBeLessThan(MAX_DAILY_BUCKETS);
  });

  it('groups a period that starts mid-month by calendar month', () => {
    const series = buildChartSeries(days('2027-01-20', 60, 0), 1);

    expect(series.map((bucket) => bucket.key)).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(series[0]?.dates).toHaveLength(12);
  });

  it('is safe without stays or days', () => {
    expect(buildChartSeries([], 3)).toEqual([]);
    expect(buildChartSeries(days('2027-07-01', 2, 1), 0).map((bucket) => bucket.occupancyPercent)).toEqual([0, 0]);
  });
});
