/**
 * @file apps/admin/src/shared/utils/idle.ts
 * @shared Inactivity timeout for staff sessions
 * @dependencies none
 */

/** Staff are signed out after this long without activity (S-11). */
export const STAFF_IDLE_LIMIT_MS = 30 * 60 * 1000;
/** How often the idle check runs. */
export const STAFF_IDLE_CHECK_MS = 30 * 1000;
/** While active, the page pings the API this often so the server's own idle limit (also 30 minutes) never fires on a working person. */
export const STAFF_KEEP_ALIVE_MS = 10 * 60 * 1000;
/** Activity is written to storage at most this often (many events, one write). */
export const ACTIVITY_WRITE_THROTTLE_MS = 10 * 1000;

/**
 * True when no activity was seen for `limitMs` or longer. Unknown activity (null) counts as active: a fresh
 * session has nothing to compare yet.
 */
export function isIdle(lastActiveMs: number | null, nowMs: number, limitMs: number = STAFF_IDLE_LIMIT_MS): boolean {
  if (lastActiveMs === null) {
    return false;
  }
  return nowMs - lastActiveMs >= limitMs;
}

/**
 * True when it is time to write the activity timestamp again.
 */
export function shouldWriteActivity(lastWrittenMs: number | null, nowMs: number): boolean {
  return lastWrittenMs === null || nowMs - lastWrittenMs >= ACTIVITY_WRITE_THROTTLE_MS;
}

/**
 * True when the person was active since the last ping and a whole `everyMs` has passed: time to tell the API the
 * session is in use. Never pings an idle tab (that would keep a forgotten session alive forever).
 */
export function shouldKeepAlive(lastActiveMs: number | null, lastPingMs: number, nowMs: number, everyMs: number = STAFF_KEEP_ALIVE_MS): boolean {
  return lastActiveMs !== null && lastActiveMs > lastPingMs && nowMs - lastPingMs >= everyMs;
}
