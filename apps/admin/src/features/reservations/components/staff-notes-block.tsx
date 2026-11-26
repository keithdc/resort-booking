/**
 * @file apps/admin/src/features/reservations/components/staff-notes-block.tsx
 * @feature reservations
 * @dependencies staff-reservations-api, ConfirmDialog
 */

'use client';

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import type { StaffBookingNote } from '@resort-booking/shared-types';
import { Alert, Box, Button, IconButton, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { ApiRequestError } from '@/shared/services/api-client';
import { formatDateTime } from '@/shared/utils/booking-labels';
import { addStaffBookingNote, fetchStaffBookingNotes, removeStaffBookingNote } from '../services/staff-reservations-api';
import { canSaveNote, NOTE_MAX_LENGTH, NOTES_EMPTY_TEXT } from '../utils/staff-notes';
import { StayBlock } from './stay-block';

interface StaffNotesBlockProps {
  bookingId: string;
  /** The notes changed: the new count and the newest note's time, so lists can show the note icon. */
  onChanged: (count: number, lastNoteAt: string | null) => void;
}

/**
 * The team's own notes on a booking (a deposit, a request, anything). Separate from the note the guest left at checkout.
 * Newest first, each with who wrote it and when. A note is never edited; it can be removed (an admin any note, an
 * employee their own). Only staff see this: the guest never does.
 */
export function StaffNotesBlock({ bookingId, onChanged }: StaffNotesBlockProps): React.JSX.Element {
  const [notes, setNotes] = useState<StaffBookingNote[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StaffBookingNote | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect((): (() => void) => {
    let cancelled = false;
    setNotes(null);
    setLoadError(null);
    setDraft('');
    setSaveError(null);
    fetchStaffBookingNotes(bookingId)
      .then((rows): void => {
        if (!cancelled) {
          setNotes(rows);
        }
      })
      .catch((err: unknown): void => {
        if (!cancelled) {
          setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load the notes.');
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [bookingId]);

  const publish = (next: StaffBookingNote[]): void => {
    setNotes(next);
    onChanged(next.length, next[0]?.createdAt ?? null);
  };

  const add = async (): Promise<void> => {
    if (notes === null || !canSaveNote(draft)) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await addStaffBookingNote(bookingId, draft.trim());
      setDraft('');
      publish([saved, ...notes]);
    } catch (err: unknown) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save the note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (removing === null || notes === null) {
      return;
    }
    setRemovePending(true);
    setRemoveError(null);
    try {
      await removeStaffBookingNote(bookingId, removing.id);
      publish(notes.filter((note): boolean => note.id !== removing.id));
      setRemoving(null);
    } catch (err: unknown) {
      setRemoveError(err instanceof ApiRequestError ? err.message : 'Could not remove the note. Please try again.');
    } finally {
      setRemovePending(false);
    }
  };

  const tooLong = draft.trim().length > NOTE_MAX_LENGTH;

  return (
    <StayBlock title="Staff notes" icon={<StickyNote2OutlinedIcon />} tone="warning">
      <Box component="form" onSubmit={(event): void => { event.preventDefault(); void add(); }}>
        <TextField
          label="Add a note for your team"
          placeholder="Deposit taken, late arrival, a request on the phone…"
          value={draft}
          onChange={(event): void => setDraft(event.target.value)}
          multiline
          minRows={2}
          maxRows={8}
          fullWidth
          error={tooLong}
          helperText={`${String(draft.length)} / ${String(NOTE_MAX_LENGTH)}`}
          slotProps={{ htmlInput: { maxLength: NOTE_MAX_LENGTH + 200 } }}
        />
        {saveError !== null ? <Alert severity="error" sx={{ mt: 1 }}>{saveError}</Alert> : null}
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
          <Button type="submit" variant="contained" size="small" disabled={saving || notes === null || !canSaveNote(draft)}>
            {saving ? 'Saving…' : 'Add note'}
          </Button>
        </Stack>
      </Box>
      {loadError !== null ? <Alert severity="error">{loadError}</Alert> : null}
      {notes === null && loadError === null ? (
        <Stack spacing={1} aria-busy="true" aria-label="Loading notes">
          <Skeleton variant="rounded" height={44} />
        </Stack>
      ) : null}
      {notes !== null && notes.length === 0 ? <Typography color="text.secondary">{NOTES_EMPTY_TEXT}</Typography> : null}
      {notes !== null && notes.length > 0 ? (
        <Stack component="ul" spacing={1} aria-label="Staff notes on this booking" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {notes.map((note): React.JSX.Element => (
            <Box key={note.id} component="li" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25, bgcolor: 'background.default' }}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {note.authorName ?? 'Former staff member'} · {formatDateTime(note.createdAt)}
                  </Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.body}</Typography>
                </Box>
                {note.canDelete ? (
                  <IconButton size="small" aria-label="Remove note" onClick={(): void => { setRemoveError(null); setRemoving(note); }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </Stack>
            </Box>
          ))}
        </Stack>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this note?"
        confirmLabel="Remove note"
        destructive
        pending={removePending}
        error={removeError}
        onConfirm={(): void => void remove()}
        onClose={(): void => setRemoving(null)}
      >
        It stops showing for everyone on your team. The removal is kept in the record of this booking.
      </ConfirmDialog>
    </StayBlock>
  );
}
