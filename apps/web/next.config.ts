import type { NextConfig } from 'next';
// Relative on purpose: next.config is loaded before workspace packages are transpiled.
import { buildStaticSecurityHeaders } from '../../packages/ui/src/security/security-headers';

const nextConfig: NextConfig = {
  // Lets a measuring build write elsewhere (NEXT_DIST_DIR=.next-measure) without disturbing a running dev server.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@resort-booking/shared-types', '@resort-booking/ui', 'maplibre-gl'],
  // Hide the framework banner header.
  poweredByHeader: false,
  // The fixed security headers for every route. The Content-Security-Policy carries a per-request nonce, so it is
  // set in src/middleware.ts instead.
  async headers() {
    return [{ source: '/:path*', headers: buildStaticSecurityHeaders({ isProduction: process.env.NODE_ENV !== 'development' }) }];
  },
  async redirects() {
    return [
      {
        // Guest stay URLs used to say `houses`; keep old links and ads working.
        source: '/properties/:slug/houses/:staySlug',
        destination: '/properties/:slug/stays/:staySlug',
        permanent: true,
      },
    ];
  },
  images: {
    // S-03: the optimizer must never process SVG files; images are served as downloads, not rendered in place.
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
