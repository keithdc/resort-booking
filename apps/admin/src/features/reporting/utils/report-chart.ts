/**
 * @file apps/admin/src/features/reporting/utils/report-chart.ts
 * @feature reporting
 * @dependencies shared-types
 *
 * Buckets the API's daily series for the ONE combined chart: a bar per day (or per month for a long
 * period) with revenue, and the share of stays booked as a line. Display arithmetic only.
 */

import type { ReportSeriesPoint } from '@resort-booking/shared-types';

/** A period longer than this many days is drawn month by month. */
export const MAX_DAILY_BUCKETS = 45;

export interface ChartBucket {
  key: string;
  /** Short axis label: "12" for a day, "Jul" for a month. */
  label: string;
  /** Full name for tooltips and screen readers: "12 Jul 2027" or "Jul 2027". */
  title: string;
  dates: string[];
  revenueCents: number;
  occupiedNights: number;
  occupancyPercent: number;
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function percent(nights: number, available: number): number {
  return available === 0 ? 0 : Math.round((nights / available) * 1000) / 10;
}

/**
 * One bucket per day for up to 45 days, otherwise one per calendar month.
 */
export function buildChartSeries(daily: readonly ReportSeriesPoint[], houseCount: number): ChartBucket[] {
  if (daily.length <= MAX_DAILY_BUCKETS) {
    return daily.map((point: ReportSeriesPoint): ChartBucket => ({
      key: point.date,
      label: String(Number.parseInt(point.date.slice(8), 10)),
      title: DAY_FORMAT.format(new Date(`${point.date}T00:00:00Z`)),
      dates: [point.date],
      revenueCents: point.revenueCents,
      occupiedNights: point.occupiedNights,
      occupancyPercent: percent(point.occupiedNights, houseCount),
    }));
  }
  const months = new Map<string, ReportSeriesPoint[]>();
  for (const point of daily) {
    const key = point.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), point]);
  }
  return [...months.entries()].map(([key, points]: [string, ReportSeriesPoint[]]): ChartBucket => {
    const first = new Date(`${key}-01T00:00:00Z`);
    const nights = points.reduce((sum: number, point: ReportSeriesPoint): number => sum + point.occupiedNights, 0);
    return {
      key,
      label: MONTH_FORMAT.format(first),
      title: MONTH_YEAR_FORMAT.format(first),
      dates: points.map((point: ReportSeriesPoint): string => point.date),
      revenueCents: points.reduce((sum: number, point: ReportSeriesPoint): number => sum + point.revenueCents, 0),
      occupiedNights: nights,
      occupancyPercent: percent(nights, houseCount * points.length),
    };
  });
}
