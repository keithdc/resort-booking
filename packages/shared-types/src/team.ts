/**
 * @file packages/shared-types/src/team.ts
 * @shared Staff roles, registration, team, invitations and audit log contracts (api + admin)
 * @dependencies index (StaffProfile, StaffReport)
 * Copied from apps/api/src/modules/team/team.types.ts, shared/roles/staff-role.ts and shared/audit/audit.types.ts.
 */

import type { StaffProfile, StaffReport } from './index';

// --- Roles and the signed-in account ---

/** Admin runs the workspace; an employee does the day-to-day (calendar, bookings, check-in). */
export type StaffRole = 'admin' | 'employee';

/** The signed-in person: the shared profile plus the role and the workspace name. */
export interface StaffAccount extends StaffProfile {
  role: StaffRole;
  organizationName: string;
  /** True for every admin; for an employee only when an admin granted "can handle refunds and money actions". */
  canManageRefunds: boolean;
}

/** What /staff/login and /staff/register answer: the session and who it belongs to. */
export interface StaffSessionResult {
  token: string;
  expiresAt: string;
  staff: StaffAccount;
}

// --- Registration ---

export interface RegistrationStatus {
  /** Whether new workspaces can be registered on this server (ALLOW_REGISTRATION). */
  open: boolean;
}

export interface RegisterRequest {
  organizationName: string;
  fullName: string;
  email: string;
  password: string;
}

// --- Team and invitations ---

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

/** What the invitation page shows before the person chooses a password. */
export interface InvitePreview {
  organizationName: string;
  email: string;
  role: StaffRole;
  /** True for an access-reset link for an existing member: the page asks for a new password only. */
  isReset: boolean;
}

export interface CreateInviteRequest {
  email: string;
  fullName: string;
  role: StaffRole;
  /** Also email the one-time link to the invited address. */
  sendEmail?: boolean;
  /** Employee only: start with "can handle refunds and money actions". Ignored for an admin. Default false. */
  canManageRefunds?: boolean;
}

/** Body of POST /staff/team/:staffId/reset-access. */
export interface ResetAccessRequest {
  /** Also email the one-time link to the member. */
  sendEmail?: boolean;
}

export interface AcceptInviteRequest {
  token: string;
  password: string;
  fullName?: string;
}

export interface MemberChange {
  role?: StaffRole;
  active?: boolean;
  /** Grant or remove "can handle refunds and money actions". Employees only; refused for an admin. */
  canManageRefunds?: boolean;
}

// --- Audit log ---

/** One row of the log as the admin list returns it. */
export interface AuditRecord {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  staffUserId: string | null;
  staffName: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditRecord[];
  /** Pass it back as `cursor` for the next (older) page; null when there is no more. */
  nextCursor: string | null;
}

/** Query of GET /staff/audit. */
export interface AuditQuery {
  /** Only actions starting with this, e.g. "team." (sent as `action`). */
  action?: string;
  /** Only what this team member did (their id from the Team page; sent as `member`). */
  member?: string;
  /** Inclusive start (ISO date or date-time). */
  from?: string;
  /** Exclusive end (ISO date or date-time). */
  to?: string;
  cursor?: string;
  /** 1-100, default 50. */
  limit?: number;
}

// --- Reports for an employee ---

/** The owner report plus a flag saying the money figures were withheld (zeroed), not really zero. */
export type RoleAwareStaffReport = StaffReport & { moneyHidden?: boolean };
