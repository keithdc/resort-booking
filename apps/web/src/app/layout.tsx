/**
 * @file apps/web/src/app/layout.tsx
 * @shared Guest root layout
 * @dependencies AppProviders
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { AppProviders } from '@/shared/components/app-providers';
import { SiteFooter } from '@/shared/components/site-footer';
import { SiteHeader } from '@/shared/components/site-header';

export const metadata: Metadata = {
  title: 'Humphreys — properties, booked directly',
  description: 'Direct booking for properties across our destinations',
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Guest HTML shell. Reading the request headers makes every page render per request, which the
 * Content-Security-Policy nonce (set in middleware.ts) needs: a pre-rendered page could not carry it.
 */
export default async function RootLayout({ children }: RootLayoutProps): Promise<React.JSX.Element> {
  await headers();
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
