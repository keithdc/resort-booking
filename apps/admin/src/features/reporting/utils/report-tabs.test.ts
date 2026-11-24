/**
 * @file apps/admin/src/features/reporting/utils/report-tabs.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { TAB_PURPOSES } from './metric-definitions';
import { DEFAULT_REPORT_TAB, REPORT_TABS, tabFromParam } from './report-tabs';

describe('tabFromParam', () => {
  it('reads a known tab from the address', () => {
    expect(tabFromParam('bookings')).toBe('bookings');
    expect(tabFromParam('payments')).toBe('payments');
  });

  it('falls back to the overview for nothing or something unknown', () => {
    expect(tabFromParam(null)).toBe(DEFAULT_REPORT_TAB);
    expect(tabFromParam('')).toBe('overview');
    expect(tabFromParam('pipeline')).toBe('overview');
  });
});

describe('REPORT_TABS', () => {
  it('has a purpose line for every tab and a distinct label', () => {
    for (const tab of REPORT_TABS) {
      expect(TAB_PURPOSES[tab.key]).toBeTruthy();
    }
    expect(new Set(REPORT_TABS.map((tab) => tab.label)).size).toBe(REPORT_TABS.length);
  });
});
