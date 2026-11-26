/**
 * @file apps/api/src/modules/identity/identity.session-policy.ts
 * @feature identity
 * @dependencies none
 *
 * How long a staff session may live (docs/13 R2-08): an IDLE limit (no request for this long ends it) and an ABSOLUTE
 * lifetime (it ends this long after sign-in whatever the activity). Admins hold the keys to money and people, so
 * their absolute lifetime is shorter by default.
 */

export interface SessionPolicy {
  /** A session unused for this long is refused and swept. Same as the admin UI's idle logout (30 minutes). */
  idleMs: number;
  /** Absolute lifetime of an employee session. */
  employeeMaxMs: number;
  /** Absolute lifetime of an admin session. */
  adminMaxMs: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const DEFAULT_IDLE_MINUTES = 30;
export const DEFAULT_EMPLOYEE_MAX_HOURS = 12;
export const DEFAULT_ADMIN_MAX_HOURS = 8;

/**
 * A whole number inside [min, max], else the fallback (a typo in an env var must not silently switch the limit off
 * or make everybody's session last a year).
 */
function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || !/^\d{1,6}$/.test(raw.trim())) {
    return fallback;
  }
  const value = Number(raw.trim());
  return value >= min && value <= max ? value : fallback;
}

/**
 * Reads STAFF_SESSION_IDLE_MINUTES (5-480, default 30), STAFF_SESSION_MAX_HOURS (1-168, default 12) and
 * STAFF_ADMIN_SESSION_MAX_HOURS (1-168, default 8).
 */
export function resolveSessionPolicy(read: (name: string) => string | undefined): SessionPolicy {
  return {
    idleMs: boundedInteger(read('STAFF_SESSION_IDLE_MINUTES'), DEFAULT_IDLE_MINUTES, 5, 480) * MINUTE_MS,
    employeeMaxMs: boundedInteger(read('STAFF_SESSION_MAX_HOURS'), DEFAULT_EMPLOYEE_MAX_HOURS, 1, 168) * HOUR_MS,
    adminMaxMs: boundedInteger(read('STAFF_ADMIN_SESSION_MAX_HOURS'), DEFAULT_ADMIN_MAX_HOURS, 1, 168) * HOUR_MS,
  };
}
