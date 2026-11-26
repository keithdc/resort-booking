/**
 * @file packages/ui/src/security/index.ts
 * @shared Security header builders (pure, no framework import)
 */

export {
  FONT_FILE_HOST,
  FONT_STYLE_HOST,
  MAPTILER_HOST,
  MAP_RASTER_FALLBACK_HOST,
  MAP_TILE_HOST,
  buildCsp,
  buildStaticSecurityHeaders,
  cspHeaderName,
  generateNonce,
  originOf,
  parseOriginList,
} from './security-headers';
export type { CspOptions, HeaderEntry } from './security-headers';
