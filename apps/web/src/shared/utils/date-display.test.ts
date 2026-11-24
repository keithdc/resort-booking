/**
 * @file apps/web/src/shared/utils/date-display.test.ts
 * @shared Date field text
 */

import { describe, expect, it } from 'vitest';
import { formatDateForField } from './date-display';

describe('formatDateForField', () => {
  it('shows an ISO date the way the field does', () => {
    expect(formatDateForField('2027-07-10')).toBe('10/07/2027');
    expect(formatDateForField('2026-12-01')).toBe('01/12/2026');
  });

  it('shows nothing for an empty or malformed value', () => {
    expect(formatDateForField('')).toBe('');
    expect(formatDateForField('10/07/2027')).toBe('');
    expect(formatDateForField('2027-7-1')).toBe('');
    expect(formatDateForField('soon')).toBe('');
  });
});
