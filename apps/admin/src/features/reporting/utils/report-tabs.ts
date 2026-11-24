/**
 * @file apps/admin/src/features/reporting/utils/report-tabs.ts
 * @feature reporting
 * @dependencies metric-definitions
 */

import type { ReportTabKey } from './metric-definitions';

export interface ReportTabOption {
  key: ReportTabKey;
  label: string;
}

/** The five tabs, in the order they appear and print. */
export const REPORT_TABS: ReportTabOption[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'properties', label: 'Properties & stays' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'cancellations', label: 'Cancellations & refunds' },
  { key: 'payments', label: 'Payments & offers' },
];

export const DEFAULT_REPORT_TAB: ReportTabKey = 'overview';

/**
 * The tab named in the page address, or the first tab when it is missing or unknown.
 */
export function tabFromParam(value: string | null): ReportTabKey {
  return REPORT_TABS.find((tab: ReportTabOption): boolean => tab.key === value)?.key ?? DEFAULT_REPORT_TAB;
}
