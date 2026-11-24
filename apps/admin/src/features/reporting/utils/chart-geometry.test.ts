/**
 * @file apps/admin/src/features/reporting/utils/chart-geometry.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { chartGeometry, polylinePoints } from './chart-geometry';
import type { ChartBucket } from './report-chart';

const AREA = { width: 400, height: 200, left: 50, right: 50, top: 10, bottom: 30 }; // plot 300 x 160

function bucket(key: string, revenueCents: number, occupancyPercent: number): ChartBucket {
  return { key, label: key, title: key, dates: [key], revenueCents, occupiedNights: 0, occupancyPercent };
}

describe('chartGeometry', () => {
  it('scales bars to the biggest revenue and stands them on the baseline', () => {
    const geometry = chartGeometry([bucket('a', 1000, 0), bucket('b', 500, 0)], AREA);

    expect(geometry.maxRevenueCents).toBe(1000);
    expect(geometry.bars[0]?.height).toBe(160);
    expect(geometry.bars[1]?.height).toBe(80);
    expect(geometry.bars[0] && geometry.bars[0].y + geometry.bars[0].height).toBe(170);
  });

  it('gives each bucket its own non-overlapping column', () => {
    const geometry = chartGeometry([bucket('a', 1, 0), bucket('b', 1, 0), bucket('c', 1, 0)], AREA);

    expect(geometry.bars.map((bar) => bar.columnWidth)).toEqual([100, 100, 100]);
    expect(geometry.bars.map((bar) => bar.columnX)).toEqual([50, 150, 250]);
    expect(geometry.bars[0] && geometry.bars[0].x >= geometry.bars[0].columnX).toBe(true);
  });

  it('puts occupancy on a 0 to 100 line through the middle of each column', () => {
    const geometry = chartGeometry([bucket('a', 0, 0), bucket('b', 0, 50), bucket('c', 0, 100)], AREA);

    expect(geometry.line.map((point) => point.y)).toEqual([170, 90, 10]);
    expect(geometry.line[0]?.x).toBe(50 + 50);
  });

  it('keeps wild percentages inside the plot', () => {
    const geometry = chartGeometry([bucket('a', 0, 140), bucket('b', 0, -5)], AREA);

    expect(geometry.line.map((point) => point.y)).toEqual([10, 170]);
  });

  it('draws flat bars when there is no revenue and nothing when there are no buckets', () => {
    expect(chartGeometry([bucket('a', 0, 0)], AREA).bars[0]?.height).toBe(0);
    expect(chartGeometry([], AREA)).toMatchObject({ bars: [], line: [], maxRevenueCents: 0 });
  });
});

describe('polylinePoints', () => {
  it('joins points for an svg polyline, rounded to one decimal', () => {
    expect(polylinePoints([{ x: 1.234, y: 2 }, { x: 3, y: 4.56 }])).toBe('1.2,2 3,4.6');
    expect(polylinePoints([])).toBe('');
  });
});
