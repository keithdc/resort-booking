/**
 * @file apps/admin/src/shared/components/confirm-dialog.tsx
 * @shared Confirmation before a destructive or far-reaching action
 * @dependencies MUI
 */

'use client';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  /** Red confirm button for things that cannot be undone. */
  destructive?: boolean;
  pending?: boolean;
  /** Shown inside the dialog when the action failed (the dialog stays open so the person can read it). */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Small modal with Cancel and a confirm button. Focus is trapped by MUI; both buttons are disabled while pending.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, destructive = false, pending = false, error = null, onConfirm, onClose }: ConfirmDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="confirm-dialog-title">
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        {error !== null ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        <DialogContentText component="div">{children}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>Cancel</Button>
        <Button variant="contained" color={destructive ? 'error' : 'primary'} onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
