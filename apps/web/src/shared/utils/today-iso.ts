/**
 * @file apps/web/src/shared/utils/today-iso.ts
 * @shared Guest picker min date (UX only)
 * @dependencies none
 */

/**
 * Local calendar today as YYYY-MM-DD for guest date inputs.
 */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
