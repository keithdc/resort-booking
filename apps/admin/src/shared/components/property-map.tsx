/**
 * @file apps/admin/src/shared/components/property-map.tsx
 * @shared Staff pin preview for listing coordinates
 * @dependencies maplibre-gl
 */

'use client';

import { Box } from '@mui/material';
import { useEffect, useState } from 'react';

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  label: string;
  zoom?: number | undefined;
  onPinChange?: ((latitude: number, longitude: number) => void) | undefined;
}

/**
 * Same OSM pin the guest site uses. Optional click/drag for staff.
 */
export function PropertyMap({
  latitude,
  longitude,
  label,
  zoom = 13,
  onPinChange,
}: PropertyMapProps): React.JSX.Element {
  const [MapView, setMapView] = useState<React.ComponentType<PropertyMapProps> | null>(null);

  useEffect((): void => {
    void import('./property-map-inner').then((mod): void => {
      setMapView((): React.ComponentType<PropertyMapProps> => mod.PropertyMapInner);
    });
  }, []);

  return (
    <Box
      sx={{
        position: 'relative',
        height: 280,
        width: '100%',
        borderRadius: 1,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
      }}
    >
      {MapView !== null ? (
        <MapView
          latitude={latitude}
          longitude={longitude}
          label={label}
          zoom={zoom}
          onPinChange={onPinChange}
        />
      ) : (
        <Box sx={{ p: 2, color: 'text.secondary' }}>Loading map…</Box>
      )}
    </Box>
  );
}
