/**
 * @file apps/admin/src/features/reporting/utils/report-compare.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { compareAmounts, comparePoints } from './report-compare';

describe('compareAmounts', () => {
  it('says higher with the percent and an up arrow', () => {
    expect(compareAmounts(112, 100)).toEqual({ direction: 'up', short: '▲ 12%', long: '12% higher than the previous period.' });
  });

  it('says lower with the percent and a down arrow', () => {
    expect(compareAmounts(95, 100)).toEqual({ direction: 'down', short: '▼ 5%', long: '5% lower than the previous period.' });
  });

  it('calls a change that rounds to zero the same', () => {
    expect(compareAmounts(100.2, 100).direction).toBe('same');
    expect(compareAmounts(100, 100).short).toBe('= same');
  });

  it('has nothing to compare with when the earlier period had none', () => {
    expect(compareAmounts(500, 0)).toMatchObject({ direction: 'none', short: 'no earlier data' });
    expect(compareAmounts(0, 0).direction).toBe('none');
  });

  it('can fall to zero', () => {
    expect(compareAmounts(0, 200)).toMatchObject({ direction: 'down', short: '▼ 100%' });
  });
});

describe('comparePoints', () => {
  it('reports the difference in points, singular and plural', () => {
    expect(comparePoints(62, 58, true).short).toBe('▲ 4 points');
    expect(comparePoints(59, 58, true).short).toBe('▲ 1 point');
    expect(comparePoints(50.5, 58, true).short).toBe('▼ 7.5 points');
  });

  it('is the same when nothing moved', () => {
    expect(comparePoints(58, 58, true).direction).toBe('same');
  });

  it('has no comparison when the earlier period had no data, even if its percent is zero', () => {
    expect(comparePoints(40, 0, false).direction).toBe('none');
  });

  it('compares with a real zero percent when there was data', () => {
    expect(comparePoints(40, 0, true).short).toBe('▲ 40 points');
  });
});
