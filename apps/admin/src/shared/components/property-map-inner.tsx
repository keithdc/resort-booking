/**
 * @file apps/admin/src/shared/components/property-map-inner.tsx
 * @shared MapLibre canvas (client only)
 * @dependencies maplibre-gl
 */

'use client';

import { Map, Marker, NavigationControl, Popup, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import { useTheme } from '@mui/material/styles';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

interface PropertyMapInnerProps {
  latitude: number;
  longitude: number;
  label: string;
  zoom?: number | undefined;
  onPinChange?: ((latitude: number, longitude: number) => void) | undefined;
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
 * OSM raster tiles. Staff can drag the pin or click the map.
 */
export function PropertyMapInner({
  latitude,
  longitude,
  label,
  zoom,
  onPinChange,
}: PropertyMapInnerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  onPinChangeRef.current = onPinChange;
  const theme = useTheme();
  const markerColor = theme.palette.primary.main;
  const canMove = onPinChange !== undefined;

  const resolvedZoom = zoom ?? 13;
  const start = useRef({ latitude, longitude, zoom: resolvedZoom, label });

  useEffect((): (() => void) => {
    const node = containerRef.current;
    if (node === null) {
      return (): void => {
        return;
      };
    }

    const origin = start.current;
    const map = new Map({
      container: node,
      style: OSM_RASTER_STYLE,
      center: [origin.longitude, origin.latitude],
      zoom: origin.zoom,
      attributionControl: {},
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const marker = new Marker({ color: markerColor, draggable: canMove })
      .setLngLat([origin.longitude, origin.latitude])
      .addTo(map);
    marker.setPopup(new Popup({ offset: 24 }).setText(origin.label));
    mapRef.current = map;
    markerRef.current = marker;

    const emit = (lat: number, lng: number): void => {
      const next = onPinChangeRef.current;
      if (next !== undefined) {
        next(lat, lng);
      }
    };

    marker.on('dragend', (): void => {
      const point = marker.getLngLat();
      emit(point.lat, point.lng);
    });
    map.on('click', (event): void => {
      if (!canMove) {
        return;
      }
      marker.setLngLat(event.lngLat);
      emit(event.lngLat.lat, event.lngLat.lng);
    });

    const resize = (): void => {
      map.resize();
    };
    map.on('load', resize);
    const timeout = window.setTimeout(resize, 250);

    return (): void => {
      window.clearTimeout(timeout);
      mapRef.current = null;
      markerRef.current = null;
      map.remove();
    };
  }, [canMove, markerColor]);

  useEffect((): void => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map === null || marker === null) {
      return;
    }
    marker.setLngLat([longitude, latitude]);
    marker.setPopup(new Popup({ offset: 24 }).setText(label));
    map.flyTo({ center: [longitude, latitude], zoom: zoom ?? 13, essential: true });
  }, [latitude, longitude, label, zoom]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
      aria-label={label}
    />
  );
}
