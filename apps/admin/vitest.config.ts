/**
 * @file apps/admin/vitest.config.ts
 * @shared Vitest setup: automatic JSX, `@/` alias, jsdom opt-in per test file
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup-dom.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
