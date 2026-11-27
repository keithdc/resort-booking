/**
 * @file apps/web/src/app/layout.tsx
 * @shared Guest root layout
 * @dependencies AppProviders
 */

import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { AppProviders } from '@/shared/components/app-providers';
import { SiteFooter } from '@/shared/components/site-footer';
import { SiteHeader } from '@/shared/components/site-header';
import { SITE_NAME, siteUrl } from '@/shared/seo/site-url';

/**
 * Site-wide defaults: the page-title ending, the address every relative link in the metadata is built from, and
 * the default card. Each page sets its own title, description and canonical link.
 */
export function generateMetadata(): Metadata {
  const base = siteUrl();
  return {
    ...(base === null ? {} : { metadataBase: new URL(base) }),
    title: { default: `${SITE_NAME}: holiday stays, booked directly`, template: `%s | ${SITE_NAME}` },
    description: 'Book holiday stays directly with the owner. See which stays are free, pay securely and arrive.',
    applicationName: SITE_NAME,
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en' },
  };
}

/**
 * Phones: render at device width and reach under the notch (`viewport-fit=cover`; sticky bars add the
 * safe-area insets). Pinch zoom stays on: it is never disabled.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: ['100vh', '100dvh'] }}>
            <SiteHeader />
            <Box component="main" id="main-content" sx={{ flexGrow: 1 }}>
              {children}
            </Box>
            <SiteFooter />
          </Box>
        </AppProviders>
      </body>
    </html>
  );
}
