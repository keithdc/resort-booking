/**
 * @file apps/admin/src/features/identity/components/staff-login-page.tsx
 * @feature identity
 * @dependencies staff-identity-api
 */

'use client';

import type { TwoFactorChallenge } from '@resort-booking/shared-types';
import type { FormEvent } from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Alert, Box, Button, Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RegistrationLink } from '@/features/registration';
import { loginStaff, loginStaffTwoFactor, needsTwoFactor } from '../services/staff-identity-api';
import { ApiRequestError, clearStaffSession, persistStaffSession } from '@/shared/services/api-client';
import { safeRedirectTarget } from '@/shared/utils/safe-redirect';

/** Why the user landed on the login page (from `?reason=`): shown as a calm notice. */
const LOGIN_NOTICES: Record<string, string> = {
  idle: 'You were signed out after 30 minutes without activity. Sign in again to continue.',
  expired: 'Your session ended. Sign in again to continue.',
};

/**
 * Owner sign-in. Session is stored for both the browser and RSC.
 */
export function StaffLoginPage(): React.JSX.Element {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step two (only for accounts with two-factor): the challenge from step one, and the code being typed.
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const reasonNotice = LOGIN_NOTICES[search.get('reason') ?? ''] ?? null;
  const sessionEnded = reasonNotice !== null;

  // Sent here because the session ended: drop the stale token and cookie so the next page load is clean.
  useEffect((): void => {
    if (sessionEnded) {
      void clearStaffSession().catch((): void => undefined);
    }
  }, [sessionEnded]);

  const finish = async (token: string): Promise<void> => {
    await persistStaffSession(token);
    router.replace(safeRedirectTarget(search.get('next')));
    router.refresh();
  };

  /** Back to the email and password step; the password is cleared so it is not kept around. */
  const backToPassword = (message: string | null): void => {
    setChallenge(null);
    setCode('');
    setUseRecovery(false);
    setPassword('');
    setError(message);
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await loginStaff(email.trim(), password);
      if (needsTwoFactor(result)) {
        setChallenge(result);
        return;
      }
      await finish(result.token);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not sign in');
    } finally {
      setPending(false);
    }
  };

  const onSubmitCode = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (challenge === null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await loginStaffTwoFactor(challenge.challengeToken, code.trim());
      await finish(result.token);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.code === 'TWO_FACTOR_CHALLENGE_INVALID') {
        // Expired, used up or too many wrong codes: only a fresh password step can continue.
        backToPassword(err.message);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not sign in');
        setCode('');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'primary.dark' }}>
      <Paper elevation={6} sx={{ width: '100%', maxWidth: 440, borderRadius: 2, p: 4 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <Box
            aria-hidden
            sx={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 2,
              bgcolor: 'secondary.main',
              color: 'secondary.contrastText',
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            H
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Humphreys
            </Typography>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
              Staff
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <LockOutlinedIcon color="primary" />
          <Typography variant="h4" component="h1">
            {challenge === null ? 'Staff sign in' : 'Two-step verification'}
          </Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {challenge === null
            ? 'This is your operator account — properties, calendar, and reports sit behind it.'
            : useRecovery
              ? 'Enter one of the recovery codes you saved when you turned on two-step verification. Each works once.'
              : 'Enter the 6-digit code from your authenticator app.'}
        </Typography>
        {reasonNotice !== null && error === null ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            {reasonNotice}
          </Alert>
        ) : null}
        {error !== null ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {challenge === null ? (
          <Stack component="form" spacing={2} onSubmit={(event): void => void onSubmit(event)}>
            <EmailField label="Email" required value={email} onChange={setEmail} autoComplete="username" />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event): void => {
                setPassword(event.target.value);
              }}
              required
              autoComplete="current-password"
            />
            <Button type="submit" variant="contained" disabled={pending || !isValidEmail(email)}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
        ) : (
          <Stack component="form" spacing={2} onSubmit={(event): void => void onSubmitCode(event)}>
            <TextField
              label={useRecovery ? 'Recovery code' : 'Authentication code'}
              value={code}
              onChange={(event): void => {
                setCode(event.target.value);
              }}
              required
              autoFocus
              autoComplete="one-time-code"
              slotProps={{ htmlInput: useRecovery ? { maxLength: 32 } : { inputMode: 'numeric', maxLength: 7 } }}
            />
            <Button type="submit" variant="contained" disabled={pending || code.trim().length < 6}>
              {pending ? 'Verifying…' : 'Verify and sign in'}
            </Button>
            <Stack direction="row" justifyContent="space-between">
              <MuiLink
                component="button"
                type="button"
                variant="body2"
                onClick={(): void => {
                  setUseRecovery(!useRecovery);
                  setCode('');
                  setError(null);
                }}
              >
                {useRecovery ? 'Use an authenticator code' : 'Use a recovery code'}
              </MuiLink>
              <MuiLink component="button" type="button" variant="body2" onClick={(): void => backToPassword(null)}>
                Back to sign in
              </MuiLink>
            </Stack>
          </Stack>
        )}
        {challenge === null ? <RegistrationLink /> : null}
      </Paper>
    </Box>
  );
}
