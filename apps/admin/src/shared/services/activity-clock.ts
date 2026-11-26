/**
 * @file apps/admin/src/shared/services/activity-clock.ts
 * @shared When the user was last active in any tab (a timestamp only, for the idle logout)
 * @dependencies none
 *
 * This is the ONLY thing the admin keeps in localStorage about the session, and it is not a secret: the staff session
 * token lives in an httpOnly cookie that scripts cannot read (docs/10 S-11). Storage failures never throw.
 */

export const STAFF_LAST_ACTIVE_STORAGE_KEY = 'staff_last_active';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Forgets the activity time (at sign-out).
 */
export function clearLastActive(): void {
  try {
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
