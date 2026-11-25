/**
 * @file scripts/copy-maplibre-worker.mjs
 * Copies MapLibre's web worker into an app's public folder.
 *
 * Vector basemaps are decoded in a web worker. MapLibre finds it with import.meta.url, which a Next.js
 * bundle rewrites, so the worker URL ends in a 404 page and the map stays blank. Serving the two files
 * from /maplibre/ and pointing MapLibre at them (setWorkerUrl) fixes that.
 *
 * Usage: node scripts/copy-maplibre-worker.mjs apps/web
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const appDir = process.argv[2];
if (appDir === undefined) {
  process.stderr.write('Usage: node scripts/copy-maplibre-worker.mjs <app dir>\n');
  process.exit(1);
}

const require = createRequire(resolve(appDir, 'package.json'));
const dist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');
const target = resolve(appDir, 'public', 'maplibre');
mkdirSync(target, { recursive: true });
for (const file of FILES) {
  const source = join(dist, file);
  if (!existsSync(source)) {
    process.stderr.write(`MapLibre worker file not found: ${source}\n`);
    process.exit(1);
  }
  copyFileSync(source, join(target, file));
}
