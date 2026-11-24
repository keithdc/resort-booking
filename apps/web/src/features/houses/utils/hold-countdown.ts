/**
 * @file apps/web/src/features/houses/utils/hold-countdown.ts
 * @feature houses
 * @dependencies none — wording and arithmetic for the hold timer; the times come from the API
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MS_PER_SECOND = 1000;

/**
 * "15 minutes", "1 minute", "48 hours", "1 hour". Under an hour it counts minutes (never less
 * than 1); from an hour up it rounds to whole hours. The length comes from the API's hold, so a
 * change of policy there changes the words here with no code change.
 */
export function formatHoldDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0 minutes';
  }
  if (totalSeconds < SECONDS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(totalSeconds / SECONDS_PER_MINUTE));
    return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.round(totalSeconds / SECONDS_PER_HOUR);
  return `${String(hours)} hour${hours === 1 ? '' : 's'}`;
}

/**
 * The ticking clock: "14:59" under an hour, "47:59:59" from an hour up. Negative or unreadable
 * input shows "00:00".
 */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = safe % SECONDS_PER_MINUTE;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Whole seconds left until `expiresAt`, never below zero. An unreadable date counts as expired.
 */
export function remainingSecondsUntil(expiresAtIso: string, nowMs: number): number {
  const expires = Date.parse(expiresAtIso);
  if (!Number.isFinite(expires)) {
    return 0;
  }
  return Math.max(0, Math.floor((expires - nowMs) / MS_PER_SECOND));
}

/**
 * Whole seconds from one instant to a later one (0 if unreadable or reversed). Used for the
 * length of the "running out" window between the API's warning time and the expiry.
 */
export function secondsBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 0;
  }
  return Math.max(0, Math.round((to - from) / MS_PER_SECOND));
}

/**
 * True once the API's warning moment for the hold has passed.
 */
export function isWarningReached(warningAtIso: string, nowMs: number): boolean {
  const warningAt = Date.parse(warningAtIso);
  return Number.isFinite(warningAt) && nowMs >= warningAt;
}

/**
 * How full the progress bar is, 0 to 100: time left out of the whole hold.
 */
export function holdProgressPercent(remainingSeconds: number, totalSeconds: number): number {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0 || !Number.isFinite(remainingSeconds)) {
    return 0;
  }
  return Math.min(100, Math.max(0, (remainingSeconds / totalSeconds) * 100));
}
