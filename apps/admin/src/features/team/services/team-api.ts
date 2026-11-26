/**
 * @file apps/admin/src/features/team/services/team-api.ts
 * @feature team
 * @dependencies api-client
 * Admin-only routes: team overview, invitations, member changes, access reset, audit log.
 */

import type {
  AuditPage,
  AuditQuery,
  CreateInviteRequest,
  InviteIssued,
  MemberChange,
  ResetAccessRequest,
  TeamMember,
  TeamOverview,
} from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/** GET /staff/team */
export function fetchTeam(): Promise<TeamOverview> {
  return getStaffApiOk<TeamOverview>('/staff/team');
}

/** POST /staff/team/invites: the token in the answer is shown once (set sendEmail to also email it). */
export function createInvite(body: CreateInviteRequest): Promise<InviteIssued> {
  return mutateStaffApiOk<InviteIssued>('/staff/team/invites', 'POST', body);
}

/** DELETE /staff/team/invites/:inviteId */
export function revokeInvite(inviteId: string): Promise<null> {
  return mutateStaffApiOk<null>(`/staff/team/invites/${encodeURIComponent(inviteId)}`, 'DELETE');
}

/** PATCH /staff/team/:staffId: role and/or active. */
export function updateMember(staffId: string, change: MemberChange): Promise<TeamMember> {
  return mutateStaffApiOk<TeamMember>(`/staff/team/${encodeURIComponent(staffId)}`, 'PATCH', change);
}

/** POST /staff/team/:staffId/reset-two-factor: removes their authenticator and recovery codes and ends their sessions. */
export function resetTwoFactor(staffId: string): Promise<null> {
  return mutateStaffApiOk<null>(`/staff/team/${encodeURIComponent(staffId)}/reset-two-factor`, 'POST', {});
}

/** POST /staff/team/:staffId/reset-access: ends their sessions and returns a one-time link (emailed too when asked). */
export function resetAccess(staffId: string, sendEmail = false): Promise<InviteIssued> {
  const body: ResetAccessRequest = sendEmail ? { sendEmail: true } : {};
  return mutateStaffApiOk<InviteIssued>(`/staff/team/${encodeURIComponent(staffId)}/reset-access`, 'POST', body);
}

/** GET /staff/audit with the filters the API supports. */
export function fetchAudit(query: AuditQuery): Promise<AuditPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return getStaffApiOk<AuditPage>(`/staff/audit${suffix}`);
}
