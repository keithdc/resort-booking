/**
 * @file packages/ui/src/map/map-style.test.ts
 * @shared Map style choice and the one-time raster fallback
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAP_STYLE_URL,
  OSM_RASTER_STYLE,
  installStyleFallback,
  resolveMapStyle,
  shouldFallBackToRaster,
  type RasterMapStyle,
  type StyleSwitchableMap,
} from './map-style';

describe('resolveMapStyle', () => {
  it('uses the light OpenFreeMap style when nothing is set', () => {
    expect(resolveMapStyle({})).toBe(DEFAULT_MAP_STYLE_URL);
    expect(DEFAULT_MAP_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  it('uses MapTiler dataviz-light when only a key is set, and encodes the key', () => {
    expect(resolveMapStyle({ maptilerKey: 'abc123' })).toBe('https://api.maptiler.com/maps/dataviz-light/style.json?key=abc123');
    expect(resolveMapStyle({ maptilerKey: 'a b&c' })).toContain('key=a%20b%26c');
  });

  it('lets an explicit style URL win over a key', () => {
    expect(resolveMapStyle({ styleUrl: 'https://tiles.example.com/style.json', maptilerKey: 'abc' })).toBe(
      'https://tiles.example.com/style.json',
    );
  });

  it('ignores blank values', () => {
    expect(resolveMapStyle({ styleUrl: '', maptilerKey: '' })).toBe(DEFAULT_MAP_STYLE_URL);
    expect(resolveMapStyle({ styleUrl: '   ', maptilerKey: '  ' })).toBe(DEFAULT_MAP_STYLE_URL);
    expect(resolveMapStyle({ styleUrl: '', maptilerKey: 'k' })).toContain('maptiler.com');
    expect(resolveMapStyle({ styleUrl: undefined, maptilerKey: undefined })).toBe(DEFAULT_MAP_STYLE_URL);
  });

  it('trims the values it keeps', () => {
    expect(resolveMapStyle({ styleUrl: '  https://x.test/style.json  ' })).toBe('https://x.test/style.json');
    expect(resolveMapStyle({ maptilerKey: '  k1  ' })).toContain('key=k1');
  });

  it('ignores a style that is not an http(s) URL, so a typo never blanks the map', () => {
    expect(resolveMapStyle({ styleUrl: 'positron' })).toBe(DEFAULT_MAP_STYLE_URL);
    expect(resolveMapStyle({ styleUrl: 'javascript:alert(1)' })).toBe(DEFAULT_MAP_STYLE_URL);
    expect(resolveMapStyle({ styleUrl: 'not a url', maptilerKey: 'k' })).toContain('maptiler.com');
  });
});

describe('shouldFallBackToRaster', () => {
  it('falls back when the style never loaded and we have not fallen back yet', () => {
    expect(shouldFallBackToRaster({ styleLoaded: false, fellBack: false })).toBe(true);
  });

  it('never falls back once the style loaded (a single tile error is not a style failure)', () => {
    expect(shouldFallBackToRaster({ styleLoaded: true, fellBack: false })).toBe(false);
  });

  it('falls back only once', () => {
    expect(shouldFallBackToRaster({ styleLoaded: false, fellBack: true })).toBe(false);
  });
});

describe('installStyleFallback', () => {
  function fakeMap(): { map: StyleSwitchableMap; fire: (type: 'error' | 'style.load') => void; setStyle: ReturnType<typeof vi.fn> } {
    const listeners: Record<string, (() => void)[]> = {};
    const setStyle = vi.fn<(style: RasterMapStyle) => void>();
    const map: StyleSwitchableMap = {
      on: (type, listener): void => {
        listeners[type] = [...(listeners[type] ?? []), listener];
      },
      setStyle,
    };
    return {
      map,
      setStyle,
      fire: (type): void => {
        (listeners[type] ?? []).forEach((listener): void => listener());
      },
    };
  }

  it('switches to the OSM raster tiles once when the style fails to load', () => {
    const { map, fire, setStyle } = fakeMap();
    installStyleFallback(map);

    fire('error');
    fire('error');

    expect(setStyle).toHaveBeenCalledTimes(1);
    expect(setStyle).toHaveBeenCalledWith(OSM_RASTER_STYLE);
  });

  it('keeps the vector style when only tiles fail after it loaded', () => {
    const { map, fire, setStyle } = fakeMap();
    installStyleFallback(map);

    fire('style.load');
    fire('error');

    expect(setStyle).not.toHaveBeenCalled();
  });
});
