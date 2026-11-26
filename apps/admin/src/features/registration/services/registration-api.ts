/**
 * @file apps/admin/src/features/registration/services/registration-api.ts
 * @feature registration
 * @dependencies public-api
 * The public routes: is registration open, create a workspace, preview and accept an invitation.
 */

import type { AcceptInviteRequest, InvitePreview, RegisterRequest, RegistrationStatus, StaffSessionResult } from '@resort-booking/shared-types';
import { requestPublicApiOk } from '@/shared/services/public-api';

/** GET /staff/register/status */
export function fetchRegistrationStatus(): Promise<RegistrationStatus> {
  return requestPublicApiOk<RegistrationStatus>('/staff/register/status', 'GET');
}

/** POST /staff/register: creates the workspace and its first admin, returns the signed-in session. */
export function registerWorkspace(body: RegisterRequest): Promise<StaffSessionResult> {
  return requestPublicApiOk<StaffSessionResult>('/staff/register', 'POST', body);
}

/** GET /staff/invites/:token/preview (404 for an unknown, used, revoked or expired link). */
export function fetchInvitePreview(token: string): Promise<InvitePreview> {
  return requestPublicApiOk<InvitePreview>(`/staff/invites/${encodeURIComponent(token)}/preview`, 'GET');
}

/** POST /staff/invites/accept: chooses the password and returns the signed-in session. */
export function acceptInvite(body: AcceptInviteRequest): Promise<StaffSessionResult> {
  return requestPublicApiOk<StaffSessionResult>('/staff/invites/accept', 'POST', body);
}
