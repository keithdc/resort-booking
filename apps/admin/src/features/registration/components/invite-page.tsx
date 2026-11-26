/**
 * @file apps/admin/src/features/registration/components/invite-page.tsx
 * @feature registration
 * @dependencies registration-api, NewPasswordField (configuration), role-chip
 */

'use client';

import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import { Alert, Box, Button, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { validatePassword } from '@resort-booking/ui/password';
import type { InvitePreview } from '@resort-booking/shared-types';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { NewPasswordField } from '@/features/configuration';
import { AuthLayout } from '@/shared/components/auth-layout';
import { RoleChip } from '@/shared/components/role-chip';
import { ApiRequestError } from '@/shared/services/api-client';
import { acceptInvite, fetchInvitePreview } from '../services/registration-api';
import { submitErrorMessage } from './session-errors';
import { PasswordInput } from '@/shared/components/password-input';

interface InvitePageProps {
  token: string;
}

type Preview = { state: 'loading' } | { state: 'invalid' } | { state: 'error'; message: string } | { state: 'ready'; invite: InvitePreview };

/**
 * The page behind an invitation (or access-reset) link: who invited you, the role, then name and password.
 * Unknown, used, revoked and expired links all give the same friendly "link not valid" page.
 */
export function InvitePage({ token }: InvitePageProps): React.JSX.Element {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview>({ state: 'loading' });
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect((): (() => void) => {
    let cancelled = false;
    fetchInvitePreview(token)
      .then((invite): void => {
        if (!cancelled) {
          setPreview({ state: 'ready', invite });
        }
      })
      .catch((err: unknown): void => {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiRequestError && err.status === 404) {
          setPreview({ state: 'invalid' });
        } else {
          setPreview({ state: 'error', message: submitErrorMessage(err, 'Could not open this invitation') });
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [token]);

  const icon = <MarkEmailReadOutlinedIcon color="primary" />;

  if (preview.state === 'loading') {
    return (
      <AuthLayout icon={icon} title="Your invitation">
        <Stack spacing={2} aria-busy="true" aria-label="Loading invitation">
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={56} />
        </Stack>
      </AuthLayout>
    );
  }

  if (preview.state === 'invalid') {
    return (
      <AuthLayout icon={<LinkOffOutlinedIcon color="warning" />} title="This link is not valid">
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The link may have expired, been used already, or been replaced. Ask your admin to send you a new one.
        </Typography>
        <Button component={NextLink} href="/login" variant="contained" fullWidth>
          Go to sign in
        </Button>
      </AuthLayout>
    );
  }

  if (preview.state === 'error') {
    return (
      <AuthLayout icon={icon} title="Your invitation">
        <Alert severity="error">{preview.message}</Alert>
      </AuthLayout>
    );
  }

  const { invite } = preview;
  const mismatch = confirm !== '' && confirm !== password;
  const isReset = invite.isReset;
  const nameOk = isReset || fullName.trim() === '' || fullName.trim().length >= 2;
  const canSubmit = !pending && nameOk && validatePassword(password, { email: invite.email }).ok && confirm === password;

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // A reset link only sets a password: the name is never sent.
      const name = isReset ? '' : fullName.trim();
      // The BFF sets the httpOnly session cookie; the answer carries no token.
      await acceptInvite({ token, password, ...(name === '' ? {} : { fullName: name }) });
      router.replace('/');
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setPreview({ state: 'invalid' });
      } else {
        setError(submitErrorMessage(err, 'Could not accept the invitation'));
      }
      setPending(false);
    }
  };

  return (
    <AuthLayout
      icon={icon}
      title={isReset ? 'Reset your password' : `Join ${invite.organizationName}`}
      description={isReset ? 'Choose a new password for your staff account.' : 'Choose a password to finish setting up your staff account.'}
    >
      <Box sx={{ mb: 3, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography variant="caption" color="text.secondary">
          Signing in as
        </Typography>
        <Typography sx={{ fontWeight: 600, wordBreak: 'break-all' }}>{invite.email}</Typography>
        {isReset ? null : (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Your role
            </Typography>
            <RoleChip role={invite.role} />
          </Stack>
        )}
      </Box>
      {error !== null ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Stack component="form" spacing={2} onSubmit={(event): void => void onSubmit(event)} noValidate>
        {isReset ? null : (
          <TextField
            label="Your name"
            value={fullName}
            onChange={(event): void => setFullName(event.target.value)}
            autoComplete="name"
            helperText="Optional: leave empty to keep the name your admin entered."
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
        )}
        <NewPasswordField label="Password" value={password} onChange={setPassword} email={invite.email} />
        <PasswordInput
          toggleLabel="Show confirm password"
          label="Confirm password"
          required
          value={confirm}
          onChange={(event): void => setConfirm(event.target.value)}
          autoComplete="new-password"
          error={mismatch}
          helperText={mismatch ? 'The passwords do not match' : undefined}
        />
        <Button type="submit" variant="contained" disabled={!canSubmit}>
          {pending ? (isReset ? 'Saving…' : 'Joining…') : isReset ? 'Set new password' : 'Accept invitation'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
