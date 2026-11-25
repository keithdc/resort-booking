/**
 * @file packages/ui/src/map/map-style.ts
 * @shared Which basemap style the maps use, and when to fall back to plain OSM tiles
 * @dependencies none (pure; no map library, so importing it costs nothing)
 */

/** The two optional settings. Callers read them from `process.env.NEXT_PUBLIC_*` (Next inlines them). */
export interface MapEnv {
  /** A full `style.json` URL (MapTiler, Protomaps, self-hosted...). Wins over everything else. */
  styleUrl?: string | undefined;
  /** A MapTiler key: uses MapTiler's light, muted "dataviz-light" style. */
  maptilerKey?: string | undefined;
}

/** Light, muted vector style from OpenFreeMap: free, no key. The default. */
export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const MAPTILER_STYLE_URL = 'https://api.maptiler.com/maps/dataviz-light/style.json';

function clean(value: string | undefined): string {
  return value === undefined ? '' : value.trim();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

/**
 * The style URL for the maps: an explicit URL, else MapTiler when a key is set, else OpenFreeMap.
 * Blank values are ignored, and so is a "URL" that is not http(s), so a typo never gives a blank map.
 */
export function resolveMapStyle(env: MapEnv): string {
  const explicit = clean(env.styleUrl);
  if (isHttpUrl(explicit)) {
    return explicit;
  }
  const key = clean(env.maptilerKey);
  if (key !== '') {
    return `${MAPTILER_STYLE_URL}?key=${encodeURIComponent(key)}`;
  }
  return DEFAULT_MAP_STYLE_URL;
}

/** A raster-only style (the shape MapLibre's StyleSpecification accepts). */
export interface RasterMapStyle {
  version: 8;
  sources: Record<string, { type: 'raster'; tiles: string[]; tileSize: number; attribution: string }>;
  layers: { id: string; type: 'raster'; source: string }[];
}

/** OpenStreetMap's own tiles: only the last resort when the vector style cannot load. */
export const OSM_RASTER_STYLE: RasterMapStyle = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export interface StyleLoadState {
  /** The style finished loading at least once. */
  styleLoaded: boolean;
  /** We already switched to the raster style once. */
  fellBack: boolean;
}

/**
 * Fall back to the raster tiles only when the style itself never loaded, and only once. A missing
 * single tile (the map emits an error for those too) must not swap the whole basemap.
 */
export function shouldFallBackToRaster(state: StyleLoadState): boolean {
  return !state.styleLoaded && !state.fellBack;
}

/** The little part of a MapLibre map that the fallback needs (so it can be tested without a map). */
export interface StyleSwitchableMap {
  on(type: 'error' | 'style.load', listener: () => void): unknown;
  setStyle(style: RasterMapStyle): unknown;
}

/**
 * Switches the map to the OSM raster tiles once if its style fails to load, so it never stays blank.
 */
export function installStyleFallback(map: StyleSwitchableMap): void {
  const state: StyleLoadState = { styleLoaded: false, fellBack: false };
  map.on('style.load', (): void => {
    state.styleLoaded = true;
  });
  map.on('error', (): void => {
    if (shouldFallBackToRaster(state)) {
      state.fellBack = true;
      map.setStyle(OSM_RASTER_STYLE);
    }
  });
}
