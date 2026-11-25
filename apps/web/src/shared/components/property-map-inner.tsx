/**
 * @file apps/web/src/shared/components/property-map-inner.tsx
 * @shared MapLibre canvas for one place (client only)
 * @dependencies maplibre-gl, @resort-booking/ui/map
 */

'use client';

import { alpha, useTheme } from '@mui/material/styles';
import { createPlacePin, installStyleFallback } from '@resort-booking/ui/map';
import { Map, Marker, NavigationControl, Popup } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { MAP_STYLE_URL } from '@/shared/map/map-config';
import { ensureMapWorker } from '@/shared/map/maplibre-worker';
import 'maplibre-gl/dist/maplibre-gl.css';

interface PropertyMapInnerProps {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * One place on a light vector basemap (no Google SDK). Scrolling the page is not hijacked: the map
 * zooms with ctrl/cmd + scroll, or with the +/- buttons and the keyboard. No rotation.
 */
export function PropertyMapInner({
  latitude,
  longitude,
  label,
}: PropertyMapInnerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const pinBackground = theme.palette.primary.main;
  const pinIcon = theme.palette.primary.contrastText;
  const pinBorder = theme.palette.background.paper;

  useEffect((): (() => void) => {
    const node = containerRef.current;
    if (node === null) {
      return (): void => {
        return;
      };
    }

    ensureMapWorker();
    const map = new Map({
      container: node,
      style: MAP_STYLE_URL,
      center: [longitude, latitude],
      zoom: 13,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
    });
    installStyleFallback(map);
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const element = createPlacePin(
      document,
      { background: pinBackground, icon: pinIcon, ring: alpha(pinBackground, 0.35), border: pinBorder },
      label,
    );
    new Marker({ element, anchor: 'center' })
      .setLngLat([longitude, latitude])
      .setPopup(new Popup({ offset: 28 }).setText(label))
      .addTo(map);

    const resize = (): void => {
      map.resize();
    };
    map.on('load', resize);
    const timeout = window.setTimeout(resize, 250);

    return (): void => {
      window.clearTimeout(timeout);
      map.remove();
    };
  }, [latitude, longitude, label, pinBackground, pinIcon, pinBorder]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
      aria-label={label}
    />
  );
}
