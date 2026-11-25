/**
 * @file apps/web/src/shared/map/map-config.test.ts
 * @shared The app reads the two map settings from the environment
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadStyle(): Promise<string> {
  vi.resetModules();
  const mod = await import('./map-config');
  return mod.MAP_STYLE_URL;
}

describe('MAP_STYLE_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the light OpenFreeMap style', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_STYLE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_MAPTILER_KEY', '');

    expect(await loadStyle()).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  it('uses MapTiler when a key is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_STYLE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_MAPTILER_KEY', 'k1');

    expect(await loadStyle()).toBe('https://api.maptiler.com/maps/dataviz-light/style.json?key=k1');
  });

  it('lets a full style URL win', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_STYLE_URL', 'https://tiles.example.com/style.json');
    vi.stubEnv('NEXT_PUBLIC_MAPTILER_KEY', 'k1');

    expect(await loadStyle()).toBe('https://tiles.example.com/style.json');
  });
});
