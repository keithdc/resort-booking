/**
 * @file apps/admin/src/shared/map/map-config.ts
 * @shared The basemap style every map in this app uses
 * @dependencies @resort-booking/ui/map
 */

import { resolveMapStyle } from '@resort-booking/ui/map';

/**
 * The vector style URL. Next only inlines `process.env.NEXT_PUBLIC_*` when it is written out in
 * full, so the two settings are read here and handed to the pure resolver.
 * Default: OpenFreeMap "positron" (light, no key). Override with NEXT_PUBLIC_MAP_STYLE_URL or
 * NEXT_PUBLIC_MAPTILER_KEY.
 */
export const MAP_STYLE_URL: string = resolveMapStyle({
  styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  maptilerKey: process.env.NEXT_PUBLIC_MAPTILER_KEY,
});
