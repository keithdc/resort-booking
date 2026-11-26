// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/note-indicator.test.tsx
 * @feature reservations
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { canSaveNote, noteCountLabel, NOTE_MAX_LENGTH } from '../utils/staff-notes';
import { DayBookingCard } from './day-booking-card';
import { NoteIndicator } from './note-indicator';

afterEach(cleanup);

describe('NoteIndicator', () => {
  it('says how many staff notes, in words for screen readers', () => {
    render(<NoteIndicator count={3} />);

    expect(screen.getByRole('img', { name: '3 staff notes' }).textContent).toBe('3');
  });

  it('uses the singular for one', () => {
    render(<NoteIndicator count={1} />);

    expect(screen.getByRole('img', { name: '1 staff note' })).toBeTruthy();
  });

  it('shows nothing when there are no notes', () => {
    const { container } = render(<NoteIndicator count={0} />);

    expect(container.textContent).toBe('');
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('the booking row under the calendar', () => {
  it('shows the note icon only for a booking that has staff notes', () => {
    const { rerender } = render(<DayBookingCard stay={staffReservation({ notesCount: 2 })} selected={false} onOpen={(): void => undefined} />);
    expect(screen.getByRole('img', { name: '2 staff notes' })).toBeTruthy();

    rerender(<DayBookingCard stay={staffReservation({ notesCount: 0 })} selected={false} onOpen={(): void => undefined} />);
    expect(screen.queryByRole('img', { name: /staff note/ })).toBeNull();
  });
});

describe('note helpers', () => {
  it('counts in words', () => {
    expect(noteCountLabel(1)).toBe('1 staff note');
    expect(noteCountLabel(4)).toBe('4 staff notes');
  });

  it('accepts one to 2000 characters once trimmed', () => {
    expect(canSaveNote('')).toBe(false);
    expect(canSaveNote('  \n ')).toBe(false);
    expect(canSaveNote('a')).toBe(true);
    expect(canSaveNote('a'.repeat(NOTE_MAX_LENGTH))).toBe(true);
    expect(canSaveNote('a'.repeat(NOTE_MAX_LENGTH + 1))).toBe(false);
  });
});
