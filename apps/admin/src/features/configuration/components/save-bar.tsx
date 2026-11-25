/**
 * @file apps/admin/src/features/configuration/components/save-bar.tsx
 * @feature configuration
 * @dependencies MUI
 */

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { Button, Paper, Stack, Typography } from '@mui/material';

interface SaveBarProps {
  dirty: boolean;
  pending: boolean;
  /** Why saving is not possible yet (shown in words next to the disabled button), or null. */
  problem: string | null;
  saveLabel: string;
  onSave: () => void;
  onDiscard: () => void;
  /** Stick to the bottom of the screen while the form is long. */
  sticky?: boolean;
}

/**
 * Says where the form stands in words ("Unsaved changes", the problem, or "All changes saved") and
 * offers Save and Discard. Save waits for a real change and for the form to be valid.
 */
export function SaveBar({ dirty, pending, problem, saveLabel, onSave, onDiscard, sticky = false }: SaveBarProps): React.JSX.Element {
  const status =
    pending ? (
      <Typography color="text.secondary">Saving…</Typography>
    ) : problem !== null ? (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'warning.dark' }}>
        <WarningAmberOutlinedIcon fontSize="small" aria-hidden />
        <Typography>{problem}</Typography>
      </Stack>
    ) : dirty ? (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'info.dark' }}>
        <EditNoteOutlinedIcon fontSize="small" aria-hidden />
        <Typography>You have unsaved changes</Typography>
      </Stack>
    ) : (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'success.dark' }}>
        <CheckCircleOutlineIcon fontSize="small" aria-hidden />
        <Typography>All changes saved</Typography>
      </Stack>
    );
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        ...(sticky ? { position: 'sticky', bottom: 16, zIndex: 2, boxShadow: 3 } : {}),
      }}
    >
      <Typography component="div" role="status" aria-live="polite">
        {status}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button disabled={!dirty || pending} onClick={onDiscard}>
          Discard
        </Button>
        <Button variant="contained" disabled={!dirty || pending || problem !== null} onClick={onSave}>
          {pending ? 'Saving…' : saveLabel}
        </Button>
      </Stack>
    </Paper>
  );
}
