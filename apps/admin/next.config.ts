import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lets a check build write elsewhere (NEXT_DIST_DIR=.next-measure) without disturbing a running dev server.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@resort-booking/shared-types', '@resort-booking/ui', 'maplibre-gl'],
};

export default nextConfig;
