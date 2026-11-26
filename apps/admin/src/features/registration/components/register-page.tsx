/**
 * @file apps/admin/src/features/registration/components/register-page.tsx
 * @feature registration
 * @dependencies registration-api, NewPasswordField (configuration), @resort-booking/ui password + contact
 */

'use client';

import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { Alert, Button, Link as MuiLink, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import { validatePassword } from '@resort-booking/ui/password';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { NewPasswordField } from '@/features/configuration';
import { AuthLayout } from '@/shared/components/auth-layout';
import { registerWorkspace } from '../services/registration-api';
import { useRegistrationStatus } from '../services/use-registration-status';
import { submitErrorMessage } from './session-errors';

/**
 * Create a workspace and its first admin. Only offered while the server allows registration; otherwise a calm
 * "closed" notice with a way back to sign in. On success the returned session is stored like a login and the
 * person lands on the calendar.
 */
export function RegisterPage(): React.JSX.Element {
  const router = useRouter();
  const status = useRegistrationStatus();
  const [organizationName, setOrganizationName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm !== '' && confirm !== password;
  const canSubmit =
    !pending &&
    organizationName.trim().length >= 2 &&
    fullName.trim().length >= 2 &&
    isValidEmail(email) &&
    validatePassword(password, { email }).ok &&
    confirm === password;

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // The BFF sets the httpOnly session cookie; the answer carries no token.
      await registerWorkspace({ organizationName: organizationName.trim(), fullName: fullName.trim(), email: email.trim(), password });
      router.replace('/');
      router.refresh();
    } catch (err: unknown) {
      setError(submitErrorMessage(err, 'Could not create the account'));
      setPending(false);
    }
  };

  if (status === 'loading') {
    return (
      <AuthLayout icon={<PersonAddAlt1OutlinedIcon color="primary" />} title="Create an account">
        <Stack spacing={2} aria-busy="true" aria-label="Checking registration">
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Stack>
      </AuthLayout>
    );
  }

  if (status !== 'open') {
    return (
      <AuthLayout icon={<PersonAddAlt1OutlinedIcon color="primary" />} title="Registration is closed">
        <Alert severity={status === 'unknown' ? 'warning' : 'info'} sx={{ mb: 3 }}>
          {status === 'unknown'
            ? 'We could not check whether registration is open. Try again in a moment.'
            : 'New accounts cannot be created on this server. If you were invited, open the link you were sent; otherwise ask your admin.'}
        </Alert>
        <Button component={NextLink} href="/login" variant="contained" fullWidth>
          Back to sign in
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={<PersonAddAlt1OutlinedIcon color="primary" />}
      title="Create an account"
      description="Set up your business and become its first admin. You can invite your team afterwards."
    >
      {error !== null ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Stack component="form" spacing={2} onSubmit={(event): void => void onSubmit(event)} noValidate>
        <TextField label="Business name" required value={organizationName} onChange={(event): void => setOrganizationName(event.target.value)} autoComplete="organization" slotProps={{ htmlInput: { maxLength: 120 } }} />
        <TextField label="Your name" required value={fullName} onChange={(event): void => setFullName(event.target.value)} autoComplete="name" slotProps={{ htmlInput: { maxLength: 120 } }} />
        <EmailField label="Email" required value={email} onChange={setEmail} autoComplete="username" />
        <NewPasswordField label="Password" value={password} onChange={setPassword} email={email} />
        <TextField
          label="Confirm password"
          type="password"
          required
          value={confirm}
          onChange={(event): void => setConfirm(event.target.value)}
          autoComplete="new-password"
          error={mismatch}
          helperText={mismatch ? 'The passwords do not match' : undefined}
        />
        <Button type="submit" variant="contained" disabled={!canSubmit}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        Already have an account?{' '}
        <MuiLink component={NextLink} href="/login">
          Sign in
        </MuiLink>
      </Typography>
    </AuthLayout>
  );
}
