/**
 * @file apps/admin/src/shared/components/app-providers.tsx
 * @shared Admin MUI theme
 * @dependencies @mui/material, @resort-booking/ui
 */

'use client';

import { CssBaseline, ThemeProvider } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { createAppTheme } from '@resort-booking/ui';
import type { ReactNode } from 'react';
import { mobileThemeOptions } from '@/shared/utils/mobile-theme';

const theme = createTheme(createAppTheme('admin'), mobileThemeOptions());

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Admin theme + CssBaseline.
 */
export function AppProviders({ children }: AppProvidersProps): React.JSX.Element {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
