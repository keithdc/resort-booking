/**
 * @file apps/web/src/shared/components/app-providers.tsx
 * @shared MUI theme for the guest app
 * @dependencies @mui/material, @resort-booking/ui
 */

'use client';

import { CssBaseline, ThemeProvider } from '@mui/material';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { createAppTheme } from '@resort-booking/ui';
import type { ReactNode } from 'react';

const theme = createAppTheme('guest');

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Guest theme + CssBaseline.
 */
export function AppProviders({ children }: AppProvidersProps): React.JSX.Element {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>{children}</LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
