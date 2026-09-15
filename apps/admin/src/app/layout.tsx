/**
 * @file apps/admin/src/app/layout.tsx
 * @shared Admin root layout
 * @dependencies AppProviders
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '@/shared/components/app-providers';

export const metadata: Metadata = {
  title: 'Resort booking admin',
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Staff HTML shell.
 */
export default function RootLayout({ children }: RootLayoutProps): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
