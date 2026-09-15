/**
 * @file apps/web/src/shared/components/property-map-inner.tsx
 * @shared MapLibre canvas (client only)
 * @dependencies maplibre-gl
 */

'use client';

import { Map, Marker, NavigationControl, Popup, type StyleSpecification } from 'maplibre-gl';
import { useTheme } from '@mui/material/styles';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

interface PropertyMapInnerProps {
  latitude: number;
  longitude: number;
  label: string;
}

const OSM_RASTER_STYLE: StyleSpecification = {
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
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
};

/**
 * OSM raster tiles through MapLibre — no Google SDK, no tile API key.
 */
export function PropertyMapInner({
  latitude,
  longitude,
  label,
}: PropertyMapInnerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const markerColor = theme.palette.primary.main;

  useEffect((): (() => void) => {
    const node = containerRef.current;
    if (node === null) {
      return (): void => {
        return;
      };
    }

    const map = new Map({
      container: node,
      style: OSM_RASTER_STYLE,
      center: [longitude, latitude],
      zoom: 13,
      attributionControl: {},
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const marker = new Marker({ color: markerColor }).setLngLat([longitude, latitude]).addTo(map);
    marker.setPopup(new Popup({ offset: 24 }).setText(label));

    const resize = (): void => {
      map.resize();
    };
    map.on('load', resize);
    const timeout = window.setTimeout(resize, 250);

    return (): void => {
      window.clearTimeout(timeout);
      map.remove();
    };
  }, [latitude, longitude, label, markerColor]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
      aria-label={label}
    />
  );
}
