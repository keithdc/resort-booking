/**
 * @file apps/admin/src/features/configuration/components/owner-account-form.tsx
 * @feature configuration
 * @dependencies staff-identity-api
 */

'use client';

import type { StaffProfile } from '@resort-booking/shared-types';
import { Alert, Box, Button, Divider, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import { validatePassword } from '@resort-booking/ui/password';
import { useState } from 'react';
import { SignedInDevices, TwoFactorSection } from '@/features/account';
import { changeStaffPassword, saveStaffProfile } from '@/features/identity/services/staff-identity-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { isFormDirty } from '../utils/form-dirty';
import { NewPasswordField } from './new-password-field';
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
  const [passwordProblems, setPasswordProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState(false);

  const dirty = isFormDirty({ fullName: saved.fullName, email: saved.email }, { fullName: name, email });
  const profileProblem = isValidEmail(email) ? null : 'Enter a valid login email to save.';
  const canChangePassword = currentPassword !== '' && validatePassword(newPassword, { email: saved.email }).ok;

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
    setPasswordProblems([]);
    try {
      await changeStaffPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNotice(true);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.code === 'PASSWORD_TOO_WEAK' && err.problems.length > 0) {
        // The server knows a rule this screen does not (or the page is out of date): show exactly what it said.
        setPasswordProblems(err.problems);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not change password');
      }
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
        <NewPasswordField label="New password" value={newPassword} onChange={setNewPassword} email={saved.email} />
      </Box>
      {passwordProblems.length > 0 ? (
        <Alert severity="error">
          The server did not accept that password:
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {passwordProblems.map((problem: string): React.JSX.Element => (
              <li key={problem}>{problem}</li>
            ))}
          </Box>
        </Alert>
      ) : null}
      <Box>
        <Button variant="outlined" disabled={pendingPassword || !canChangePassword} onClick={(): void => void onSavePassword()}>
          {pendingPassword ? 'Saving…' : 'Change password'}
        </Button>
      </Box>
      <Divider />
      <TwoFactorSection />
      <Divider />
      <SignedInDevices />
      <Snackbar open={notice} autoHideDuration={3000} onClose={(): void => setNotice(false)}>
        <Alert severity="success" onClose={(): void => setNotice(false)}>
          Account saved
        </Alert>
      </Snackbar>
    </Stack>
  );
}
