// @vitest-environment jsdom
/**
 * @file maplibre-worker.test.ts
 * @shared MapLibre worker URL is set once
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const maplibre = vi.hoisted(() => ({ setWorkerUrl: vi.fn<(url: string) => void>() }));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: maplibre.setWorkerUrl }));

describe('ensureMapWorker', () => {
  beforeEach(() => {
    maplibre.setWorkerUrl.mockClear();
    vi.resetModules();
  });

  it('points MapLibre at the worker served from /maplibre/ on this origin', async () => {
    const { ensureMapWorker, MAP_WORKER_PATH } = await import('./maplibre-worker');

    ensureMapWorker();

    expect(MAP_WORKER_PATH).toBe('/maplibre/maplibre-gl-worker.mjs');
    expect(maplibre.setWorkerUrl).toHaveBeenCalledTimes(1);
    expect(maplibre.setWorkerUrl).toHaveBeenCalledWith(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
  });

  it('only sets it once, however many maps open', async () => {
    const { ensureMapWorker } = await import('./maplibre-worker');

    ensureMapWorker();
    ensureMapWorker();
    ensureMapWorker();

    expect(maplibre.setWorkerUrl).toHaveBeenCalledTimes(1);
  });
});
