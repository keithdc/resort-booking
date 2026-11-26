/**
 * @file apps/admin/src/features/reservations/utils/staff-notes.ts
 * @feature reservations
 */

/** The most characters a note may hold (the API enforces the same limit). */
export const NOTE_MAX_LENGTH = 2000;

/** What the empty list says. */
export const NOTES_EMPTY_TEXT = 'Only your team sees these notes. The guest never does.';

/** "1 staff note" / "3 staff notes". */
export function noteCountLabel(count: number): string {
  return `${String(count)} staff ${count === 1 ? 'note' : 'notes'}`;
}

/** Can this text be saved? One non-blank character and not above the limit. */
export function canSaveNote(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= NOTE_MAX_LENGTH;
}
