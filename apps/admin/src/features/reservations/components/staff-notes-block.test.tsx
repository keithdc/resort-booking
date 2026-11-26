// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/staff-notes-block.test.tsx
 * @feature reservations
 */

import type { StaffBookingNote } from '@resort-booking/shared-types';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { StaffNotesBlock } from './staff-notes-block';

const api = vi.hoisted(() => ({
  fetchStaffBookingNotes: vi.fn<(id: string) => Promise<StaffBookingNote[]>>(),
  addStaffBookingNote: vi.fn<(id: string, body: string) => Promise<StaffBookingNote>>(),
  removeStaffBookingNote: vi.fn<(id: string, noteId: string) => Promise<void>>(),
}));
vi.mock('../services/staff-reservations-api', () => api);

function note(overrides: Partial<StaffBookingNote> = {}): StaffBookingNote {
  return { id: 'n1', bookingId: 'b1', body: 'Deposit of 50 EUR taken', authorName: 'Eve Employee', createdAt: '2026-12-01T10:00:00.000Z', canDelete: true, ...overrides };
}

describe('StaffNotesBlock', () => {
  const onChanged = vi.fn<(count: number, lastNoteAt: string | null) => void>();

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    onChanged.mockReset();
    api.fetchStaffBookingNotes.mockResolvedValue([]);
  });
  afterEach(cleanup);

  it('says who can see the notes when there are none', async () => {
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);

    expect(await screen.findByText('Only your team sees these notes. The guest never does.')).toBeTruthy();
    expect(api.fetchStaffBookingNotes).toHaveBeenCalledWith('b1');
  });

  it('lists notes with author and time, in the order the API sent them', async () => {
    api.fetchStaffBookingNotes.mockResolvedValue([note({ id: 'n2', body: 'Second', authorName: 'Ada Admin' }), note()]);
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);

    const list = await screen.findByRole('list', { name: 'Staff notes on this booking' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Ada Admin');
    expect(items[0]?.textContent).toContain('Second');
    expect(items[1]?.textContent).toContain('Eve Employee');
    expect(items[1]?.textContent).toContain('Deposit of 50 EUR taken');
  });

  it('adds a note, shows it first, clears the box and reports the new count', async () => {
    const user = userEvent.setup();
    api.fetchStaffBookingNotes.mockResolvedValue([note()]);
    api.addStaffBookingNote.mockResolvedValue(note({ id: 'n9', body: 'Arrives after 22:00', createdAt: '2026-12-02T09:00:00.000Z' }));
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);
    await screen.findByRole('list', { name: 'Staff notes on this booking' });

    const box = screen.getByLabelText('Add a note for your team');
    await user.type(box, '  Arrives after 22:00  ');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(api.addStaffBookingNote).toHaveBeenCalledWith('b1', 'Arrives after 22:00'));
    const items = await screen.findAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Arrives after 22:00');
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(onChanged).toHaveBeenLastCalledWith(2, '2026-12-02T09:00:00.000Z');
  });

  it('keeps Add note disabled for an empty or blank note and shows the counter', async () => {
    const user = userEvent.setup();
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);
    await screen.findByText(/Only your team/);

    const add = screen.getByRole('button', { name: 'Add note' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await user.type(screen.getByLabelText('Add a note for your team'), '   ');
    expect(add.disabled).toBe(true);
    await user.type(screen.getByLabelText('Add a note for your team'), 'ok');
    expect(add.disabled).toBe(false);
    expect(screen.getByText('5 / 2000')).toBeTruthy();
  });

  it('shows the API message when saving fails and keeps what was typed', async () => {
    const user = userEvent.setup();
    api.addStaffBookingNote.mockRejectedValue(new ApiRequestError('Too many notes in a short time. Wait a moment and try again.', 429, { code: 'STAFF_NOTE_RATE_LIMITED' }));
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);
    await screen.findByText(/Only your team/);

    await user.type(screen.getByLabelText('Add a note for your team'), 'Keep me');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Too many notes');
    expect((screen.getByLabelText('Add a note for your team') as HTMLTextAreaElement).value).toBe('Keep me');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('offers Remove only on notes the person may remove, and asks first', async () => {
    const user = userEvent.setup();
    api.fetchStaffBookingNotes.mockResolvedValue([note({ id: 'mine' }), note({ id: 'theirs', body: 'A colleague wrote this', canDelete: false })]);
    api.removeStaffBookingNote.mockResolvedValue(undefined);
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);
    await screen.findByRole('list', { name: 'Staff notes on this booking' });

    expect(screen.getAllByRole('button', { name: 'Remove note' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove note' }));
    expect(api.removeStaffBookingNote).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove note' }));

    await waitFor(() => expect(api.removeStaffBookingNote).toHaveBeenCalledWith('b1', 'mine'));
    await waitFor(() => expect(screen.queryByText('Deposit of 50 EUR taken')).toBeNull());
    expect(screen.getByText('A colleague wrote this')).toBeTruthy();
    expect(onChanged).toHaveBeenLastCalledWith(1, '2026-12-01T10:00:00.000Z');
  });

  it('shows a friendly message when the notes cannot be loaded', async () => {
    api.fetchStaffBookingNotes.mockRejectedValue(new ApiRequestError('Booking not found', 404, { code: 'BOOKING_NOT_FOUND' }));
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);

    expect((await screen.findByRole('alert')).textContent).toContain('Booking not found');
  });

  it('renders the note as plain text, never as markup', async () => {
    api.fetchStaffBookingNotes.mockResolvedValue([note({ body: '<img src=x onerror=alert(1)> **bold**' })]);
    render(<StaffNotesBlock bookingId="b1" onChanged={onChanged} />);

    const list = await screen.findByRole('list', { name: 'Staff notes on this booking' });
    expect(list.querySelector('img')).toBeNull();
    expect(list.textContent).toContain('<img src=x onerror=alert(1)> **bold**');
  });
});
