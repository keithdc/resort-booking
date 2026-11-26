/**
 * @file apps/admin/src/features/registration/components/registration-link.tsx
 * @feature registration
 * @dependencies use-registration-status
 */

'use client';

import { Link as MuiLink, Typography } from '@mui/material';
import NextLink from 'next/link';
import { useRegistrationStatus } from '../services/use-registration-status';

/**
 * "Create an account" for the login page. Renders nothing unless registration is open on this server.
 */
export function RegistrationLink(): React.JSX.Element | null {
  const state = useRegistrationStatus();
  if (state !== 'open') {
    return null;
  }
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
      New here?{' '}
      <MuiLink component={NextLink} href="/register">
        Create an account
      </MuiLink>
    </Typography>
  );
}
