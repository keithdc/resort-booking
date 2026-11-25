/**
 * @file apps/admin/src/features/configuration/components/owner-account-form.tsx
 * @feature configuration
 * @dependencies staff-identity-api
 */

'use client';

import type { StaffProfile } from '@resort-booking/shared-types';
import { Alert, Box, Button, Divider, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import { useState } from 'react';
import { changeStaffPassword, saveStaffProfile } from '@/features/identity/services/staff-identity-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { isFormDirty, passwordProblem } from '../utils/form-dirty';
import { SaveBar } from './save-bar';

interface OwnerAccountFormProps {
  initial: StaffProfile;
}

/**
 * Sign-in email, display name, and password for the operator. Two small forms with their own
 * Save: the profile (a save bar that waits for a change) and the password (waits for both fields).
 */
export function OwnerAccountForm({ initial }: OwnerAccountFormProps): React.JSX.Element {
  const [saved, setSaved] = useState<StaffProfile>(initial);
  const [name, setName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pendingProfile, setPendingProfile] = useState(false);
  const [pendingPassword, setPendingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);

  const dirty = isFormDirty({ fullName: saved.fullName, email: saved.email }, { fullName: name, email });
  const profileProblem = isValidEmail(email) ? null : 'Enter a valid login email to save.';
  const newPasswordProblem = passwordProblem(newPassword);
  const canChangePassword = currentPassword !== '' && newPassword !== '' && newPasswordProblem === null;

  const onSaveProfile = async (): Promise<void> => {
    setPendingProfile(true);
    setError(null);
    try {
      const next = await saveStaffProfile({ fullName: name.trim(), email: email.trim() });
      setSaved(next);
      setName(next.fullName);
      setEmail(next.email);
      setNotice(true);
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
      setNotice(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change password');
    } finally {
      setPendingPassword(false);
    }
  };

  return (
    <Stack spacing={3}>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <TextField label="Your name" value={name} onChange={(event): void => setName(event.target.value)} />
        <EmailField label="Login email" required value={email} onChange={setEmail} autoComplete="username" />
      </Box>
      <SaveBar
        dirty={dirty}
        pending={pendingProfile}
        problem={profileProblem}
        saveLabel="Save login"
        onSave={(): void => void onSaveProfile()}
        onDiscard={(): void => {
          setName(saved.fullName);
          setEmail(saved.email);
        }}
      />
      <Divider />
      <Typography variant="h6" component="h3">
        Password
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <TextField
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(event): void => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
        <TextField
          label="New password"
          type="password"
          error={newPasswordProblem !== null}
          helperText="At least 8 characters, with a letter and a number."
          value={newPassword}
          onChange={(event): void => setNewPassword(event.target.value)}
          autoComplete="new-password"
        />
      </Box>
      <Box>
        <Button variant="outlined" disabled={pendingPassword || !canChangePassword} onClick={(): void => void onSavePassword()}>
          {pendingPassword ? 'Saving…' : 'Change password'}
        </Button>
      </Box>
      <Snackbar open={notice} autoHideDuration={3000} onClose={(): void => setNotice(false)}>
        <Alert severity="success" onClose={(): void => setNotice(false)}>
          Account saved
        </Alert>
      </Snackbar>
    </Stack>
  );
}
