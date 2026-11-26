/**
 * @file apps/admin/src/features/account/components/two-factor-password-dialog.tsx
 * @feature account
 * @dependencies MUI
 */

'use client';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { PasswordInput } from '@/shared/components/password-input';

interface TwoFactorPasswordDialogProps {
  open: boolean;
  /** Runs the action with the typed password; throw to show the error. */
  onConfirm: (currentPassword: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Asks for the current password before two-step verification can be set up: someone who only holds a signed-in
 * session (a borrowed computer, a stolen token) must not be able to add their own authenticator. The server checks it.
 */
export function TwoFactorPasswordDialog({ open, onConfirm, onClose }: TwoFactorPasswordDialogProps): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(password);
      setPassword('');
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start the setup. Try again.');
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : close} fullWidth maxWidth="xs" aria-labelledby="two-factor-password-title">
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogTitle id="two-factor-password-title">Confirm your password</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              Enter your password to set up two-step verification. When you finish, your other signed-in devices are signed out.
            </DialogContentText>
            {error !== null ? <Alert severity="error">{error}</Alert> : null}
            <PasswordInput
              label="Current password"
              value={password}
              onChange={(event): void => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || password === ''}>
            {pending ? 'Checking…' : 'Continue'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
