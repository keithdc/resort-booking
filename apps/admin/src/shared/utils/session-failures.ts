/**
 * @file apps/admin/src/shared/utils/session-failures.ts
 * @shared Which 401 answers mean "the session ended" and which only mean "that password or code was wrong"
 * @dependencies none
 */

/** A 401 with one of these codes means "the password or code you typed is wrong", not "your session ended". */
export const NOT_A_SESSION_FAILURES: ReadonlySet<string> = new Set(['STAFF_PASSWORD_MISMATCH', 'TWO_FACTOR_CODE_INVALID']);

/**
 * True when a 401 answer with this code ends the session (anything but a wrong password or code typed by the person).
 */
export function endsSession(code: string | undefined): boolean {
  return code === undefined || !NOT_A_SESSION_FAILURES.has(code);
}
