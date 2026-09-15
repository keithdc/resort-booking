import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@resort-booking/shared-types', '@resort-booking/ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
