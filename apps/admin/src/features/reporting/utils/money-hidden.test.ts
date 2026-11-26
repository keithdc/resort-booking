/**
 * @file apps/admin/src/features/reporting/utils/money-hidden.test.ts
 * @feature reporting
 */

import type { StaffReport } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { isMoneyHidden } from './money-hidden';

function report(extra: object): StaffReport {
  return { ...({} as StaffReport), ...extra };
}

describe('isMoneyHidden', () => {
  it('is true only for an explicit moneyHidden: true', () => {
    expect(isMoneyHidden(report({ moneyHidden: true }))).toBe(true);
    expect(isMoneyHidden(report({ moneyHidden: false }))).toBe(false);
    expect(isMoneyHidden(report({}))).toBe(false);
  });
});
