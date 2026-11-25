/**
 * @file apps/admin/src/features/identity/components/staff-login-page.tsx
 * @feature identity
 * @dependencies staff-identity-api
 */

'use client';

import type { FormEvent } from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { loginStaff } from '../services/staff-identity-api';
import { ApiRequestError, persistStaffSession } from '@/shared/services/api-client';

/**
 * Owner sign-in. Session is stored for both the browser and RSC.
 */
export function StaffLoginPage(): React.JSX.Element {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('owner@atlantic.example');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await loginStaff(email.trim(), password);
      await persistStaffSession(result.token);
      const next = search.get('next');
      router.replace(next !== null && next.startsWith('/') ? next : '/');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not sign in');
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
            Staff sign in
          </Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This is your operator account — properties, calendar, and reports sit behind it.
        </Typography>
        {error !== null ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
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
      </Paper>
    </Box>
  );
}
