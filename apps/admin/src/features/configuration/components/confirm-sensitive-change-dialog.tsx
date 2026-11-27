/**
 * @file apps/admin/src/features/configuration/components/confirm-sensitive-change-dialog.tsx
 * @feature configuration
 * @dependencies MUI, PasswordInput
 */

'use client';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { PasswordInput } from '@/shared/components/password-input';
import { ApiRequestError } from '@/shared/services/api-client';

interface ConfirmSensitiveChangeDialogProps {
  open: boolean;
  /** Saves with the proof; throw to show the error. The code is sent only once the server asked for it. */
  onConfirm: (currentPassword: string, twoFactorCode: string | undefined) => Promise<void>;
  onClose: () => void;
}

/**
 * Asks for the current password (and an authenticator code when the server says two-step verification is on) before the
 * bank details or an email address are changed: someone holding only a signed-in session must not be able to redirect
 * the money or the guest mail. The server checks it; nothing is stored here.
 */
export function ConfirmSensitiveChangeDialog({ open, onConfirm, onClose }: ConfirmSensitiveChangeDialogProps): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setPassword('');
    setCode('');
    setNeedsCode(false);
    setError(null);
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(password, needsCode && code.trim() !== '' ? code.trim() : undefined);
      reset();
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.code === 'REAUTH_REQUIRED_2FA') {
        setNeedsCode(true);
        setError('Two-step verification is on. Enter the code from your authenticator app, or a recovery code.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save. Try again.');
        setPassword('');
        setCode('');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : close} fullWidth maxWidth="xs" aria-labelledby="confirm-sensitive-title">
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogTitle id="confirm-sensitive-title">Confirm it is you</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              You are changing bank details or an email address. These decide where money and guest messages go, so enter your password to save. The change is recorded in the audit log with your name.
            </DialogContentText>
            {error !== null ? <Alert severity={needsCode ? 'info' : 'error'}>{error}</Alert> : null}
            <PasswordInput
              label="Current password"
              value={password}
              onChange={(event): void => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
            {needsCode ? (
              <TextField
                label="Authenticator or recovery code"
                value={code}
                onChange={(event): void => setCode(event.target.value)}
                autoComplete="one-time-code"
                slotProps={{ htmlInput: { inputMode: 'text', maxLength: 64 } }}
                required
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || password === '' || (needsCode && code.trim() === '')}>
            {pending ? 'Saving…' : 'Confirm and save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
