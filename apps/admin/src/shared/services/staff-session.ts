/**
 * @file apps/admin/src/shared/services/staff-session.ts
 * @shared The ONE place the browser keeps the staff token (and when the user was last active)
 * @dependencies none
 *
 * Interim hardening for docs/10 S-11. The token still lives in localStorage for the client-side API calls, so
 * an XSS bug could read it: the Content-Security-Policy (middleware.ts) is the main defence until Phase 2 moves
 * the token into an httpOnly cookie behind Next route handlers (BFF), after which the browser never holds it.
 * Rules kept here: the token is never put in a URL, a log line or an error message; storage failures never throw.
 */

export const STAFF_TOKEN_STORAGE_KEY = 'staff_token';
export const STAFF_LAST_ACTIVE_STORAGE_KEY = 'staff_last_active';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored token, or '' (also when storage is blocked).
 */
export function readStoredStaffToken(): string {
  try {
    return storage()?.getItem(STAFF_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Remembers the token and starts the inactivity clock.
 */
export function storeStaffToken(token: string, now: number = Date.now()): void {
  try {
    storage()?.setItem(STAFF_TOKEN_STORAGE_KEY, token);
    storage()?.setItem(STAFF_LAST_ACTIVE_STORAGE_KEY, String(now));
  } catch {
    // Blocked storage: the httpOnly cookie still carries the session for server components.
  }
}

/**
 * Forgets the token and the activity time.
 */
export function clearStoredStaffToken(): void {
  try {
    storage()?.removeItem(STAFF_TOKEN_STORAGE_KEY);
    storage()?.removeItem(STAFF_LAST_ACTIVE_STORAGE_KEY);
  } catch {
    // Nothing more to do.
  }
}

/**
 * When the user was last active in any tab (ms since epoch), or null when unknown.
 */
export function readLastActive(): number | null {
  try {
    const raw = storage()?.getItem(STAFF_LAST_ACTIVE_STORAGE_KEY) ?? null;
    if (raw === null) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Records activity (shared by all tabs through storage).
 */
export function writeLastActive(now: number = Date.now()): void {
  try {
    storage()?.setItem(STAFF_LAST_ACTIVE_STORAGE_KEY, String(now));
  } catch {
    // Not remembered: the in-memory clock of this tab still works.
  }
}
