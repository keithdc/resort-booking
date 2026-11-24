/**
 * @file apps/admin/src/shared/utils/record-note.ts
 * @shared The note staff must write when they act on a booking or a refund (kept on the record)
 */

export const MIN_NOTE_LENGTH = 3;
export const MAX_NOTE_LENGTH = 500;

/**
 * The note is required and kept on the record: a few real characters, not just spaces.
 */
export function noteProblem(note: string): string | null {
  const length = note.trim().length;
  if (length < MIN_NOTE_LENGTH) {
    return `Write at least ${String(MIN_NOTE_LENGTH)} characters: who asked and why`;
  }
  return length > MAX_NOTE_LENGTH ? `Keep the note under ${String(MAX_NOTE_LENGTH)} characters` : null;
}
