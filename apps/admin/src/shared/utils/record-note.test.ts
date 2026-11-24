/**
 * @file apps/admin/src/shared/utils/record-note.test.ts
 * @shared Staff record note rule
 */

import { describe, expect, it } from 'vitest';
import { MAX_NOTE_LENGTH, MIN_NOTE_LENGTH, noteProblem } from './record-note';

describe('noteProblem', () => {
  it('needs a few real characters, not spaces', () => {
    expect(noteProblem('')).not.toBeNull();
    expect(noteProblem('   ')).not.toBeNull();
    expect(noteProblem('a'.repeat(MIN_NOTE_LENGTH - 1))).not.toBeNull();
    expect(noteProblem('  abc  ')).toBeNull();
  });

  it('accepts the longest allowed note and refuses one more character', () => {
    expect(noteProblem('x'.repeat(MAX_NOTE_LENGTH))).toBeNull();
    expect(noteProblem('x'.repeat(MAX_NOTE_LENGTH + 1))).toContain('under');
  });
});
