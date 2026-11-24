/**
 * @file apps/admin/src/features/reporting/utils/chart-geometry.ts
 * @feature reporting
 * @dependencies report-chart
 *
 * Where each bar and each point of the occupancy line goes in the combined chart's drawing area.
 * Pure arithmetic so it can be tested without a browser.
 */

import type { ChartBucket } from './report-chart';

export interface ChartArea {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface BarShape {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The full-height column used as the click target. */
  columnX: number;
  columnWidth: number;
}

export interface LinePoint {
  x: number;
  y: number;
}

export interface ChartGeometry {
  bars: BarShape[];
  line: LinePoint[];
  maxRevenueCents: number;
  plotTop: number;
  plotBottom: number;
  plotLeft: number;
  plotRight: number;
}

/** Bars never touch: this share of each column is the bar. */
const BAR_FILL = 0.64;

/**
 * Bars for revenue (scaled to the biggest bucket) and a line for occupancy (0 to 100 percent).
 */
export function chartGeometry(buckets: readonly ChartBucket[], area: ChartArea): ChartGeometry {
  const plotLeft = area.left;
  const plotRight = area.width - area.right;
  const plotTop = area.top;
  const plotBottom = area.height - area.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const column = buckets.length === 0 ? 0 : plotWidth / buckets.length;
  const maxRevenueCents = Math.max(0, ...buckets.map((bucket: ChartBucket): number => bucket.revenueCents));

  const bars = buckets.map((bucket: ChartBucket, index: number): BarShape => {
    const height = maxRevenueCents === 0 ? 0 : (bucket.revenueCents / maxRevenueCents) * plotHeight;
    const width = column * BAR_FILL;
    return {
      key: bucket.key,
      x: plotLeft + index * column + (column - width) / 2,
      y: plotBottom - height,
      width,
      height,
      columnX: plotLeft + index * column,
      columnWidth: column,
    };
  });

  const line = buckets.map((bucket: ChartBucket, index: number): LinePoint => ({
    x: plotLeft + index * column + column / 2,
    y: plotBottom - (Math.min(100, Math.max(0, bucket.occupancyPercent)) / 100) * plotHeight,
  }));

  return { bars, line, maxRevenueCents, plotTop, plotBottom, plotLeft, plotRight };
}

/**
 * "x,y x,y" for an SVG polyline.
 */
export function polylinePoints(points: readonly LinePoint[]): string {
  return points.map((point: LinePoint): string => `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`).join(' ');
}
