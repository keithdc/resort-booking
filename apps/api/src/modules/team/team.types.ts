/**
 * @file apps/api/src/modules/team/team.types.ts
 * @feature team
 * @dependencies staff-role
 * Response shapes of the registration and team endpoints. They live here until the UI step adds them to
 * packages/shared-types.
 */

import type { StaffRole } from '../../shared/roles/staff-role';

export interface RegistrationStatus {
  /** Whether new workspaces can be registered on this server (ALLOW_REGISTRATION). */
  open: boolean;
}

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  /** A switched-off member cannot sign in; their history stays. */
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Money access: always true for an admin; for an employee only when an admin granted it. */
  canManageRefunds: boolean;
  /** True for the person asking, so the screen can say "you" and hide the buttons that cannot apply. */
  isYou: boolean;
}

export interface TeamInvite {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  expiresAt: string;
  createdAt: string;
  createdByName: string | null;
  /** True once the link has run out; the admin can send a new one. */
  expired: boolean;
  /** True for an access-reset link of an existing member, false for a first invitation. */
  isReset: boolean;
  /** The refund permission the new account starts with (employees only; always false for an admin invite). */
  canManageRefunds: boolean;
}

export interface TeamOverview {
  members: TeamMember[];
  invites: TeamInvite[];
  /** True when the server can email invitation links (RESEND_API_KEY set); the screen then offers "Email the link". */
  mailEnabled: boolean;
}

/** What happened to the email the admin asked for: sent, tried and failed, or no mail provider is set up. */
export type InviteEmailStatus = 'sent' | 'failed' | 'not_configured';

/** The one-time link's token is returned here ONCE and never again; only its hash is stored. */
export interface InviteIssued {
  invite: TeamInvite;
  inviteToken: string;
  expiresAt: string;
  /** Only present when the admin asked for the link to be emailed. The invite exists whatever this says. */
  emailStatus?: InviteEmailStatus;
}

/** What the invitation page shows before the person chooses a password. Nothing else about the workspace. */
export interface InvitePreview {
  organizationName: string;
  email: string;
  role: StaffRole;
  /** True for an access-reset link for an existing member: the page asks for a new password only. */
  isReset: boolean;
}

export interface MemberChange {
  role?: StaffRole;
  active?: boolean;
  /** Grant or remove "can handle refunds and money actions". Employees only; refused for an admin. */
  canManageRefunds?: boolean;
}
