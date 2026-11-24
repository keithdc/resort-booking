/**
 * @file packages/ui/vitest.config.ts
 * @shared Vitest setup: automatic JSX, jsdom opt-in per test file
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
