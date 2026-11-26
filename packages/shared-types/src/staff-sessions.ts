/**
 * @file packages/shared-types/src/staff-sessions.ts
 * @shared "Signed-in devices": a staff member's own sessions (admin app and api)
 * @dependencies none
 */

/** One sign-in of the signed-in person. Never carries the token, a hash of it, an IP or the raw User-Agent. */
export interface StaffSessionInfo {
  id: string;
  /** Coarse label such as "Chrome on macOS". */
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string;
  /** The absolute end of this sign-in (the idle limit can end it sooner). */
  expiresAt: string;
  /** True for the session that made this request. */
  current: boolean;
}

/** GET /staff/me/sessions */
export interface StaffSessionList {
  sessions: StaffSessionInfo[];
}

/** POST /staff/me/sessions/revoke-others and POST /staff/logout-all */
export interface StaffSessionsEnded {
  sessionsEnded: number;
}
