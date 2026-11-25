/**
 * @file maplibre-worker.ts
 * @shared Points MapLibre at the web worker served from /maplibre/
 * @dependencies maplibre-gl
 */

import { setWorkerUrl } from 'maplibre-gl';

/** Where `scripts/copy-maplibre-worker.mjs` puts the worker (apps/<app>/public/maplibre/). */
export const MAP_WORKER_PATH = '/maplibre/maplibre-gl-worker.mjs';

let configured = false;

/**
 * Vector tiles are decoded in a web worker. Next.js rewrites the URL MapLibre would work out for
 * itself, so the worker 404s and the map stays blank. Call before creating a map (once is enough).
 */
export function ensureMapWorker(): void {
  if (configured) {
    return;
  }
  setWorkerUrl(`${window.location.origin}${MAP_WORKER_PATH}`);
  configured = true;
}
