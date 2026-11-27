/**
 * @file apps/admin/src/features/team/utils/team-messages.ts
 * @feature team
 * @dependencies api-client (error type)
 */

import { ApiRequestError } from '@/shared/services/api-client';

/** Friendlier wording for the refusals an admin can actually hit; anything else keeps the API's own message. */
const FRIENDLY: Record<string, string> = {
  LAST_ADMIN: 'This is the only active admin, so they cannot be switched off or made an employee. Make someone else an admin first, then try again.',
  CANNOT_DEACTIVATE_SELF: 'You cannot switch yourself off. Ask another admin to do it.',
  MEMBER_INACTIVE: 'Switch this person back on before resetting their access.',
  EMAIL_TAKEN: 'Someone with this email already has an account in the system.',
  NOTHING_TO_CHANGE: 'Nothing to change: they already have this setting.',
  REFUND_ACCESS_NOT_FOR_ADMIN: 'Admins always have refund access. It can only be given to employees.',
  CANNOT_CHANGE_OWN_REFUND_ACCESS: 'You cannot change your own refund access. Ask another admin.',
  STAFF_NOT_FOUND: 'This person is no longer on the team. Reload the page.',
  INVITE_NOT_FOUND: 'This invitation no longer exists. Reload the page.',
};

/** Text for a failed team action (shown in a snackbar or inside the confirm dialog). */
export function teamErrorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 403 && error.code === undefined) {
      return 'Only admins can do this.';
    }
    return (error.code !== undefined ? FRIENDLY[error.code] : undefined) ?? error.message;
  }
  return fallback;
}

/** True for the "only admin left" refusal, so the screen can keep the dialog open and explain. */
export function isLastAdminError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'LAST_ADMIN';
}

/**
 * The full invitation address to hand over. The origin is the admin app's own. The token is after the `#`, so it is never
 * sent to any server, written to an access log or passed on in a Referer header.
 */
export function inviteUrl(origin: string, token: string): string {
  return `${origin}/invite#token=${token}`;
}
