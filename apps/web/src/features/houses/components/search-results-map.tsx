/**
 * @file apps/web/src/features/houses/components/search-results-map.tsx
 * @feature houses
 * @dependencies search-results-map-inner (loaded on demand)
 */

'use client';

import { Box, Skeleton } from '@mui/material';
import { useEffect, useState } from 'react';
import type { SearchResultsMapInnerProps } from './search-results-map-inner';

/**
 * Loads the heavy map library only when a results page needs it, so it never weighs on pages
 * without a map. Shows a placeholder meanwhile.
 */
export function SearchResultsMap(props: SearchResultsMapInnerProps): React.JSX.Element {
  const [MapView, setMapView] = useState<React.ComponentType<SearchResultsMapInnerProps> | null>(null);

  useEffect((): void => {
    void import('./search-results-map-inner').then((mod): void => {
      setMapView((): React.ComponentType<SearchResultsMapInnerProps> => mod.SearchResultsMapInner);
    });
  }, []);

  return (
    <Box sx={{ position: 'relative', height: '100%', width: '100%', bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
      {MapView === null ? <Skeleton variant="rectangular" aria-label="Loading map" sx={{ position: 'absolute', inset: 0, height: '100%' }} /> : <MapView {...props} />}
    </Box>
  );
}
