/**
 * @file apps/admin/src/shared/components/property-map-inner.tsx
 * @shared MapLibre canvas (client only)
 * @dependencies maplibre-gl
 */

'use client';

import { alpha, useTheme } from '@mui/material/styles';
import { createPlacePin, installStyleFallback } from '@resort-booking/ui/map';
import { Map, Marker, NavigationControl, Popup, type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { MAP_STYLE_URL } from '@/shared/map/map-config';
import { ensureMapWorker } from '@/shared/map/maplibre-worker';
import 'maplibre-gl/dist/maplibre-gl.css';

interface PropertyMapInnerProps {
  latitude: number;
  longitude: number;
  label: string;
  zoom?: number | undefined;
  onPinChange?: ((latitude: number, longitude: number) => void) | undefined;
}

interface PinView {
  latitude: number;
  longitude: number;
  label: string;
  zoom: number;
}

const SAME_POINT_DEG = 0.00001;

/**
 * One place on a light vector basemap. Staff can drag the pin or click the map; the page keeps scrolling
 * (ctrl/cmd + scroll zooms) and there is no rotation.
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
  const userMovedRef = useRef(false);
  const theme = useTheme();
  const pinBackground = theme.palette.primary.main;
  const pinIcon = theme.palette.primary.contrastText;
  const pinBorder = theme.palette.background.paper;
  const canMove = onPinChange !== undefined;
  const resolvedZoom = zoom ?? 13;
  const view: PinView = { latitude, longitude, label, zoom: resolvedZoom };
  const viewRef = useRef(view);
  viewRef.current = view;
  const start = useRef(view);
  const lastJumpRef = useRef({ latitude, longitude });
  const [mapEpoch, setMapEpoch] = useState(0);

  useEffect((): (() => void) => {
    const node = containerRef.current;
    if (node === null) {
      return (): void => {
        return;
      };
    }

    const origin = start.current;
    ensureMapWorker();
    const map = new Map({
      container: node,
      style: MAP_STYLE_URL,
      center: [origin.longitude, origin.latitude],
      zoom: origin.zoom,
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
      origin.label,
    );
    if (canMove) {
      element.style.cursor = 'grab';
    }
    const marker = new Marker({ element, anchor: 'center', draggable: canMove })
      .setLngLat([origin.longitude, origin.latitude])
      .setPopup(new Popup({ offset: 28 }).setText(origin.label))
      .addTo(map);
    mapRef.current = map;
    markerRef.current = marker;

    const emit = (lat: number, lng: number): void => {
      userMovedRef.current = true;
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
      showPinAt(map, marker, {
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
        label: viewRef.current.label,
        zoom: viewRef.current.zoom,
      });
      emit(event.lngLat.lat, event.lngLat.lng);
    });

    const resize = (): void => {
      map.resize();
      showPinAt(map, marker, viewRef.current);
    };
    map.on('load', resize);
    const timeout = window.setTimeout(resize, 250);
    setMapEpoch((epoch): number => epoch + 1);

    return (): void => {
      window.clearTimeout(timeout);
      mapRef.current = null;
      markerRef.current = null;
      map.remove();
    };
  }, [canMove, pinBackground, pinIcon, pinBorder]);

  useEffect((): void => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map === null || marker === null) {
      return;
    }
    const next: PinView = { latitude, longitude, label, zoom: resolvedZoom };
    showPinAt(map, marker, next);
    const movedByUser = userMovedRef.current;
    userMovedRef.current = false;
    const previous = lastJumpRef.current;
    const jumpedFromOutside =
      Math.abs(previous.latitude - next.latitude) >= SAME_POINT_DEG ||
      Math.abs(previous.longitude - next.longitude) >= SAME_POINT_DEG;
    lastJumpRef.current = { latitude: next.latitude, longitude: next.longitude };
    if (movedByUser || !jumpedFromOutside) {
      return;
    }
    map.flyTo({ center: [next.longitude, next.latitude], zoom: next.zoom, essential: true });
  }, [latitude, longitude, label, resolvedZoom, mapEpoch]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
      aria-label={label}
    />
  );
}

function showPinAt(map: MapLibreMap, marker: Marker, view: PinView): void {
  if (marker.getElement().parentNode === null) {
    marker.addTo(map);
  }
  marker.setLngLat([view.longitude, view.latitude]);
  marker.getPopup().setText(view.label);
}
