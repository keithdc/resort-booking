/**
 * @file apps/admin/src/features/team/utils/format-time.ts
 * @feature team
 * @dependencies none
 */

/** "26 Nov 2026, 14:05" in the viewer's time zone; the input unchanged when it is not a date. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Last sign-in for a table cell: the time, or "Never" for someone who has not signed in yet. */
export function formatLastSignIn(iso: string | null): string {
  return iso === null ? 'Never' : formatDateTime(iso);
}
