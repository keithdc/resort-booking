/**
 * @file apps/admin/src/features/account/services/signed-in-devices-api.ts
 * @feature account
 * @dependencies api-client
 */

import type { StaffSessionInfo, StaffSessionList, StaffSessionsEnded } from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/** GET /staff/me/sessions: the signed-in person's own sessions, this one flagged `current`. */
export async function fetchSignedInDevices(): Promise<StaffSessionInfo[]> {
  return (await getStaffApiOk<StaffSessionList>('/staff/me/sessions')).sessions;
}

/** DELETE /staff/me/sessions/:id: signs one of the person's own devices out. */
export function signOutDevice(sessionId: string): Promise<{ revoked: true }> {
  return mutateStaffApiOk<{ revoked: true }>(`/staff/me/sessions/${encodeURIComponent(sessionId)}`, 'DELETE');
}

/** POST /staff/me/sessions/revoke-others: signs out every device except this one. */
export function signOutOtherDevices(): Promise<StaffSessionsEnded> {
  return mutateStaffApiOk<StaffSessionsEnded>('/staff/me/sessions/revoke-others', 'POST', {});
}
