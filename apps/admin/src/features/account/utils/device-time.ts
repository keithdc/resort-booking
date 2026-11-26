/**
 * @file apps/admin/src/features/account/utils/device-time.ts
 * @feature account
 * @dependencies none
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * "just now", "12 minutes ago", "3 hours ago", else the date: when a device last used its session. `now` is passed in
 * so the text is testable.
 */
export function describeLastActive(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    return 'Unknown';
  }
  const age = Math.max(0, now - time);
  if (age < 2 * MINUTE_MS) {
    return 'just now';
  }
  if (age < HOUR_MS) {
    return `${String(Math.floor(age / MINUTE_MS))} minutes ago`;
  }
  if (age < 24 * HOUR_MS) {
    const hours = Math.floor(age / HOUR_MS);
    return hours === 1 ? '1 hour ago' : `${String(hours)} hours ago`;
  }
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "Signed in 26 Nov, 09:14": when the sign-in happened (the person's own locale and time zone).
 */
export function describeSignedIn(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    return 'Unknown';
  }
  return new Date(time).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
