/**
 * @file apps/admin/src/features/reporting/utils/money-hidden.ts
 * @feature reporting
 * @dependencies shared-types
 */

import type { RoleAwareStaffReport, StaffReport } from '@resort-booking/shared-types';

/**
 * True when the API withheld the money figures (an employee's report): they are zeros, not real zeros, so the
 * screen must not show them. Older API answers without the flag count as "shown".
 */
export function isMoneyHidden(report: StaffReport): boolean {
  return (report as RoleAwareStaffReport).moneyHidden === true;
}
