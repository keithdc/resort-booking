/**
 * @file apps/admin/src/features/identity/services/staff-identity-api.ts
 * @feature identity
 * @dependencies api-client
 */

import type {
  ChangeStaffPasswordRequest,
  StaffLoginResult,
  StaffProfile,
  TwoFactorChallenge,
  TwoFactorConfirmRequest,
  TwoFactorRecoveryCodes,
  TwoFactorSetup,
  TwoFactorStatus,
  UpdateStaffProfileRequest,
} from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk, postStaffLogin, postStaffPublic } from '@/shared/services/api-client';

/** What sign-in answers: a session, or (only for an account with two-factor) a challenge for step two. */
export type StaffLoginOutcome = StaffLoginResult | TwoFactorChallenge;

/** True when sign-in needs the second step. */
export function needsTwoFactor(outcome: StaffLoginOutcome): outcome is TwoFactorChallenge {
  return 'twoFactorRequired' in outcome;
}

export function loginStaff(email: string, password: string): Promise<StaffLoginOutcome> {
  return postStaffLogin<StaffLoginOutcome>(email, password);
}

/** Step two of sign-in: the challenge token plus an authenticator code or a recovery code. */
export function loginStaffTwoFactor(challengeToken: string, code: string): Promise<StaffLoginResult> {
  return postStaffPublic<StaffLoginResult>('/staff/login/two-factor', { challengeToken, code }, 'Could not sign in');
}

export function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  return getStaffApiOk<TwoFactorStatus>('/staff/me/two-factor');
}

/** Needs the current password: a session alone cannot plant an authenticator (docs/13 R2-07). */
export function startTwoFactorSetup(currentPassword: string): Promise<TwoFactorSetup> {
  return mutateStaffApiOk<TwoFactorSetup>('/staff/me/two-factor/setup', 'POST', { currentPassword });
}

/** Needs the current password and the first code. The server signs every other session of this person out. */
export function enableTwoFactor(currentPassword: string, code: string): Promise<TwoFactorRecoveryCodes> {
  return mutateStaffApiOk<TwoFactorRecoveryCodes>('/staff/me/two-factor/enable', 'POST', { currentPassword, code });
}

export function disableTwoFactor(body: TwoFactorConfirmRequest): Promise<{ disabled: true }> {
  return mutateStaffApiOk<{ disabled: true }>('/staff/me/two-factor/disable', 'POST', body);
}

export function regenerateRecoveryCodes(body: TwoFactorConfirmRequest): Promise<TwoFactorRecoveryCodes> {
  return mutateStaffApiOk<TwoFactorRecoveryCodes>('/staff/me/two-factor/recovery-codes/regenerate', 'POST', body);
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
