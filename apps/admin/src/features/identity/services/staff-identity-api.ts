/**
 * @file apps/admin/src/features/identity/services/staff-identity-api.ts
 * @feature identity
 * @dependencies api-client
 */

import type {
  ChangeStaffPasswordRequest,
  StaffLoginResult,
  StaffProfile,
  UpdateStaffProfileRequest,
} from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk, postStaffLogin } from '@/shared/services/api-client';

export function loginStaff(email: string, password: string): Promise<StaffLoginResult> {
  return postStaffLogin<StaffLoginResult>(email, password);
}

export function fetchStaffMe(): Promise<StaffProfile> {
  return getStaffApiOk<StaffProfile>('/staff/me');
}

export function saveStaffProfile(body: UpdateStaffProfileRequest): Promise<StaffProfile> {
  return mutateStaffApiOk<StaffProfile>('/staff/me', 'PATCH', body);
}

export function changeStaffPassword(body: ChangeStaffPasswordRequest): Promise<{ changed: true }> {
  return mutateStaffApiOk<{ changed: true }>('/staff/me/password', 'POST', body);
}

export function logoutStaff(): Promise<{ loggedOut: true }> {
  return mutateStaffApiOk<{ loggedOut: true }>('/staff/logout', 'POST', {});
}
