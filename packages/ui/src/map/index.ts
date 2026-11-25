/**
 * @file packages/ui/src/map/index.ts
 * @shared Map basemap config and the single-place pin (no map library imported here)
 */

export {
  DEFAULT_MAP_STYLE_URL,
  OSM_RASTER_STYLE,
  installStyleFallback,
  resolveMapStyle,
  shouldFallBackToRaster,
} from './map-style';
export type { MapEnv, RasterMapStyle, StyleLoadState, StyleSwitchableMap } from './map-style';
export { PIN_CSS, PIN_STYLE_ID, PULSE_CLASS, createPlacePin, ensurePinStyles } from './place-pin';
export type { PlacePinColors } from './place-pin';
