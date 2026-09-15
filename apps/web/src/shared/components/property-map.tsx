/**
 * @file apps/web/src/shared/components/property-map.tsx
 * @shared Vector map + outbound directions
 * @dependencies maplibre-gl
 */

'use client';

import { Box, Button, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * MapLibre + OpenFreeMap (OSM data). Google/Apple stay as direction links only.
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
  const osmUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;

  return (
    <Box>
      <Box
        sx={{
          position: 'relative',
          height: { xs: 280, md: 420 },
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
      <Stack spacing={1} sx={{ mt: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Map from OpenStreetMap. Turn-by-turn opens in Google or Apple Maps.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button href={osmUrl} target="_blank" rel="noreferrer" variant="outlined" fullWidth>
            OpenStreetMap
          </Button>
          <Button href={googleUrl} target="_blank" rel="noreferrer" variant="outlined" fullWidth>
            Google Maps
          </Button>
          <Button href={appleUrl} target="_blank" rel="noreferrer" variant="outlined" fullWidth>
            Apple Maps
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
