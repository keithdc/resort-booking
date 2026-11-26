/**
 * @file apps/admin/src/shared/components/auth-backdrop.tsx
 * @shared Full-screen teal backdrop for the signed-out pages (sign in, register, invitation)
 * @dependencies MUI
 */

'use client';

import { Box, GlobalStyles } from '@mui/material';
import type { ReactNode } from 'react';

interface AuthBackdropProps {
  children: ReactNode;
}

/**
 * Paints the WHOLE screen teal, not only the box around the card: the page itself (html and body) is teal too, so
 * a phone's overscroll bounce, the notch and the home-indicator strip never show the light page behind. The box is at
 * least one full dynamic viewport tall (dvh follows the phone's collapsing address bar) and pads for the safe areas.
 * The page styles go away again when the user leaves, so the app pages keep their own background.
 */
export function AuthBackdrop({ children }: AuthBackdropProps): React.JSX.Element {
  return (
    <>
      <GlobalStyles styles={(theme) => ({ 'html, body': { backgroundColor: theme.palette.primary.dark } })} />
      <Box
        component="main"
        sx={{
          minHeight: '100vh',
          // The @supports rule below is the progressive enhancement for browsers that know dvh.
          '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          bgcolor: 'primary.dark',
          pt: 'max(16px, env(safe-area-inset-top))',
          pr: 'max(16px, env(safe-area-inset-right))',
          pb: 'max(16px, env(safe-area-inset-bottom))',
          pl: 'max(16px, env(safe-area-inset-left))',
        }}
      >
        {children}
      </Box>
    </>
  );
}
