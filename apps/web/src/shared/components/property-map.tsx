/**
 * @file apps/web/src/shared/components/property-map.tsx
 * @shared OSM map + directions (Leaflet)
 * @dependencies leaflet, react-leaflet
 */

'use client';

import { Box, Button, Stack } from '@mui/material';
import { useEffect, useState } from 'react';

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * Map pin with Google and Apple directions. No Google script on page load.
 */
export function PropertyMap({ latitude, longitude, label }: PropertyMapProps): React.JSX.Element {
  const [MapView, setMapView] = useState<React.ComponentType<PropertyMapProps> | null>(null);

  useEffect((): void => {
    void import('./property-map-inner').then((mod): void => {
      setMapView((): React.ComponentType<PropertyMapProps> => mod.PropertyMapInner);
    });
  }, []);

  const googleUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
  const appleUrl = `https://maps.apple.com/?ll=${latitude},${longitude}&q=${encodeURIComponent(label)}`;

  return (
    <Box>
      <Box
        sx={{
          height: 320,
          width: '100%',
          borderRadius: 1,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {MapView !== null ? (
          <MapView latitude={latitude} longitude={longitude} label={label} />
        ) : (
          <Box sx={{ p: 2, color: 'text.secondary' }}>Loading map…</Box>
        )}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button href={googleUrl} target="_blank" rel="noreferrer" variant="outlined">
          Google Maps
        </Button>
        <Button href={appleUrl} target="_blank" rel="noreferrer" variant="outlined">
          Apple Maps
        </Button>
      </Stack>
    </Box>
  );
}
