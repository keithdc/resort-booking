/**
 * @file apps/admin/src/features/configuration/components/owner-account-form.tsx
 * @feature configuration
 * @dependencies staff-identity-api
 */

'use client';

import type { StaffProfile } from '@resort-booking/shared-types';
import { Alert, Button, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui';
import { useState } from 'react';
import { changeStaffPassword, saveStaffProfile } from '@/features/identity/services/staff-identity-api';
import { ApiRequestError } from '@/shared/services/api-client';

interface OwnerAccountFormProps {
  initial: StaffProfile;
}

/**
 * Sign-in email, display name, and password for the operator.
 */
export function OwnerAccountForm({ initial }: OwnerAccountFormProps): React.JSX.Element {
  const [name, setName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pendingProfile, setPendingProfile] = useState(false);
  const [pendingPassword, setPendingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSaveProfile = async (): Promise<void> => {
    setPendingProfile(true);
    setError(null);
    try {
      const next = await saveStaffProfile({ fullName: name.trim(), email: email.trim() });
      setName(next.fullName);
      setEmail(next.email);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save account');
    } finally {
      setPendingProfile(false);
    }
  };

  const onSavePassword = async (): Promise<void> => {
    setPendingPassword(true);
    setError(null);
    try {
      await changeStaffPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change password');
    } finally {
      setPendingPassword(false);
    }
  };

  return (
    <Stack spacing={2}>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      <TextField
        label="Your name"
        value={name}
        onChange={(event): void => {
          setName(event.target.value);
        }}
      />
      <EmailField label="Login email" required value={email} onChange={setEmail} autoComplete="username" />
      <Button variant="contained" disabled={pendingProfile || !isValidEmail(email)} onClick={(): void => void onSaveProfile()}>
        {pendingProfile ? 'Saving…' : 'Save login'}
      </Button>
      <Typography variant="h6" sx={{ pt: 2 }}>
        Password
      </Typography>
      <TextField
        label="Current password"
        type="password"
        value={currentPassword}
        onChange={(event): void => {
          setCurrentPassword(event.target.value);
        }}
        autoComplete="current-password"
      />
      <TextField
        label="New password"
        type="password"
        helperText="At least 8 characters, with a letter and a number."
        value={newPassword}
        onChange={(event): void => {
          setNewPassword(event.target.value);
        }}
        autoComplete="new-password"
      />
      <Button variant="outlined" disabled={pendingPassword} onClick={(): void => void onSavePassword()}>
        {pendingPassword ? 'Saving…' : 'Change password'}
      </Button>
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          Account saved
        </Alert>
      </Snackbar>
    </Stack>
  );
}
