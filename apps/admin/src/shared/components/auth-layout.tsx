/**
 * @file apps/admin/src/shared/components/auth-layout.tsx
 * @shared Full-screen card for the signed-out pages (register, invitation): brand, title, body
 * @dependencies MUI
 */

import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Same look as the sign-in page: deep teal screen, white card, brand mark, one h1.
 */
export function AuthLayout({ icon, title, description, children }: AuthLayoutProps): React.JSX.Element {
  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'primary.dark' }}>
      <Paper elevation={6} sx={{ width: '100%', maxWidth: 480, borderRadius: 2, p: { xs: 3, sm: 4 } }}>
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
          {icon}
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
        </Stack>
        {description === undefined ? null : (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {description}
          </Typography>
        )}
        {children}
      </Paper>
    </Box>
  );
}
