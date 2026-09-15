/**
 * @file apps/web/src/app/layout.tsx
 * @shared Guest root layout
 * @dependencies AppProviders
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { AppProviders } from '@/shared/components/app-providers';
import { SiteFooter } from '@/shared/components/site-footer';
import { SiteHeader } from '@/shared/components/site-header';

export const metadata: Metadata = {
  title: 'Atlantic — properties, booked directly',
  description: 'Direct booking for properties across our destinations',
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Guest HTML shell.
 */
export default function RootLayout({ children }: RootLayoutProps): React.JSX.Element {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <SiteHeader />
            <Box sx={{ flexGrow: 1 }}>{children}</Box>
            <SiteFooter />
          </Box>
        </AppProviders>
      </body>
    </html>
  );
}
