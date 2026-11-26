/**
 * @file apps/api/src/shared/roles/staff-role.ts
 * @shared The two staff roles and the signed-in account the guards hand to handlers
 * @dependencies none
 */

import type { StaffProfile } from '@resort-booking/shared-types';

/** Admin runs the workspace; an employee does the day-to-day (calendar, bookings, check-in). */
export type StaffRole = 'admin' | 'employee';

export const STAFF_ROLES: readonly StaffRole[] = ['admin', 'employee'];

export function isStaffRole(value: unknown): value is StaffRole {
  return value === 'admin' || value === 'employee';
}

/**
 * The signed-in person: the shared profile plus the role and the workspace name. Added fields only, so
 * clients that read `StaffProfile` keep working.
 */
export interface StaffAccount extends StaffProfile {
  role: StaffRole;
  organizationName: string;
}

/** What /staff/login and /staff/register answer: the session and who it belongs to. */
export interface StaffSessionResult {
  token: string;
  expiresAt: string;
  staff: StaffAccount;
}
