import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@resort-booking/shared-types', '@resort-booking/ui'],
};

export default nextConfig;
