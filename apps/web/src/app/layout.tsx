/**
 * @file apps/web/src/app/layout.tsx
 * @shared Guest root layout
 * @dependencies AppProviders
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '@/shared/components/app-providers';

export const metadata: Metadata = {
  title: 'Resort booking',
  description: 'Direct booking for houses across our properties',
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
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
