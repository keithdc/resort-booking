/**
 * @file apps/admin/src/app/layout.tsx
 * @shared Admin root layout
 * @dependencies AppProviders, StaffShell
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { AppProviders } from '@/shared/components/app-providers';
import { StaffShell } from '@/shared/components/staff-shell';

export const metadata: Metadata = {
  title: 'Resort booking admin',
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Staff HTML shell with sidebar. Reading the request headers makes every page render per request, which the
 * Content-Security-Policy nonce (set in middleware.ts) needs.
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
          <StaffShell>{children}</StaffShell>
        </AppProviders>
      </body>
    </html>
  );
}
