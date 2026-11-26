/**
 * @file apps/admin/src/shared/services/staff-account.ts
 * @shared The signed-in account with its role (GET /staff/me)
 * @dependencies api-client
 */

import type { StaffAccount, StaffRole } from '@resort-booking/shared-types';
import { getStaffApiOk } from './api-client';

/**
 * Who is signed in, with role and workspace name. Works in the browser and in server components.
 */
export function fetchStaffAccount(): Promise<StaffAccount> {
  return getStaffApiOk<StaffAccount>('/staff/me');
}

/** True when the role may open the admin-only screens. Hiding links is comfort; the API enforces it. */
export function isAdminRole(role: StaffRole | null | undefined): boolean {
  return role === 'admin';
}
