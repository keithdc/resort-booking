/**
 * @file apps/admin/src/features/registration/services/registration-api.ts
 * @feature registration
 * @dependencies public-api
 * The public routes: is registration open, create a workspace, preview and accept an invitation.
 */

import type { AcceptInviteRequest, InvitePreview, RegisterRequest, RegistrationStatus } from '@resort-booking/shared-types';
import type { SignedInAnswer } from '@/shared/services/api-client';
import { requestPublicApiOk } from '@/shared/services/public-api';

/** GET /staff/register/status */
export function fetchRegistrationStatus(): Promise<RegistrationStatus> {
  return requestPublicApiOk<RegistrationStatus>('/staff/register/status', 'GET');
}

/** POST /staff/register: creates the workspace and its first admin, the server sets the session cookie. */
export function registerWorkspace(body: RegisterRequest): Promise<SignedInAnswer> {
  return requestPublicApiOk<SignedInAnswer>('/staff/register', 'POST', body);
}

/** POST /staff/invites/preview with the token in the body (404 for an unknown, used, revoked or expired link). */
export function fetchInvitePreview(token: string): Promise<InvitePreview> {
  return requestPublicApiOk<InvitePreview>('/staff/invites/preview', 'POST', { token });
}

/** POST /staff/invites/accept: chooses the password and the server sets the session cookie. */
export function acceptInvite(body: AcceptInviteRequest): Promise<SignedInAnswer> {
  return requestPublicApiOk<SignedInAnswer>('/staff/invites/accept', 'POST', body);
}
