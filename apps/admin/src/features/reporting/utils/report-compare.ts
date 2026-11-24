/**
 * @file apps/admin/src/features/reporting/utils/report-compare.ts
 * @feature reporting
 * @dependencies none
 *
 * Wording for "how is this against the period before". Display arithmetic only: the numbers
 * themselves come from the API.
 */

export type ChangeDirection = 'up' | 'down' | 'same' | 'none';

export interface Change {
  direction: ChangeDirection;
  /** "▲ 12%" / "▼ 5%" / "= same" / "no earlier data". Never colour alone. */
  short: string;
  /** "12% higher than the previous period". */
  long: string;
}

const NO_EARLIER: Change = { direction: 'none', short: 'no earlier data', long: 'No earlier data to compare with.' };

/**
 * Percent change of an amount or a count. `none` when the earlier period had nothing to compare.
 */
export function compareAmounts(current: number, previous: number): Change {
  if (previous === 0) {
    return NO_EARLIER;
  }
  const percent = Math.round((Math.abs(current - previous) / Math.abs(previous)) * 100);
  if (percent === 0) {
    return { direction: 'same', short: '= same', long: 'About the same as the previous period.' };
  }
  return current > previous
    ? { direction: 'up', short: `▲ ${percent}%`, long: `${percent}% higher than the previous period.` }
    : { direction: 'down', short: `▼ ${percent}%`, long: `${percent}% lower than the previous period.` };
}

/**
 * Change of a percentage in points (62% against 58% is 4 points, not 7%).
 */
export function comparePoints(current: number, previous: number, previousHadData: boolean): Change {
  if (!previousHadData) {
    return NO_EARLIER;
  }
  const points = Math.round(Math.abs(current - previous) * 10) / 10;
  if (points === 0) {
    return { direction: 'same', short: '= same', long: 'The same as the previous period.' };
  }
  const word = points === 1 ? 'point' : 'points';
  return current > previous
    ? { direction: 'up', short: `▲ ${points} ${word}`, long: `${points} ${word} higher than the previous period.` }
    : { direction: 'down', short: `▼ ${points} ${word}`, long: `${points} ${word} lower than the previous period.` };
}
