/**
 * @file apps/admin/src/features/account/components/two-factor-confirm-dialog.tsx
 * @feature account
 * @dependencies MUI
 */

'use client';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { PasswordInput } from '@/shared/components/password-input';

interface TwoFactorConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  description: string;
  confirmLabel: string;
  /** Destructive actions get a red button. */
  destructive?: boolean;
  /** Runs the action with the typed password and code; throw to show the error. */
  onConfirm: (currentPassword: string, code: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Asks for the current password AND a code (authenticator or recovery) before turning two-step verification off or
 * replacing the recovery codes. The server checks both again; this only collects them.
 */
export function TwoFactorConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: TwoFactorConfirmDialogProps): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setPassword('');
    setCode('');
    setError(null);
    onClose();
  };

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(password, code.trim());
      setPassword('');
      setCode('');
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
      setCode('');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : close} fullWidth maxWidth="xs" aria-labelledby="two-factor-confirm-title">
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogTitle id="two-factor-confirm-title">{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>{description}</DialogContentText>
            {error !== null ? <Alert severity="error">{error}</Alert> : null}
            <PasswordInput
              label="Current password"
              value={password}
              onChange={(event): void => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
            <TextField
              label="Authenticator or recovery code"
              value={code}
              onChange={(event): void => setCode(event.target.value)}
              autoComplete="one-time-code"
              required
              slotProps={{ htmlInput: { maxLength: 32 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color={destructive ? 'error' : 'primary'} disabled={pending || password === '' || code.trim().length < 6}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
