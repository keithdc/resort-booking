/**
 * @file apps/web/src/features/houses/components/search-results-map-inner.tsx
 * @feature houses
 * @dependencies maplibre-gl, map-pins (client only; draws what it is given)
 */

'use client';

import { LngLatBounds, Map, Marker, NavigationControl, Popup } from 'maplibre-gl';
import { useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useRef } from 'react';
import { OSM_RASTER_STYLE } from '@/shared/components/property-map-inner';
import type { MapPinStayView, MapPinView } from '../utils/map-pins';
import 'maplibre-gl/dist/maplibre-gl.css';

/** Stays shown as chips before the rest collapse into "+N more". */
export const MAX_VISIBLE_CHIPS = 4;

export interface SearchResultsMapInnerProps {
  pins: MapPinView[];
  /** The stay to highlight (the card being hovered, or the chip under the mouse). */
  activeHouseId: string | null;
  onHoverHouse: (houseId: string | null) => void;
}

interface Palette {
  paper: string;
  ink: string;
  accent: string;
  onAccent: string;
  border: string;
  radius: number;
}

/**
 * Every stay on the map with its own price: at each place a small stack of chips ("Lake Chalet
 * 960 €"), one per stay. A chip opens its stay; hovering it lights up the matching card. Anything
 * past a few stays collapses into "+N more", which opens a list. All text arrives ready-made.
 */
export function SearchResultsMapInner({ pins, activeHouseId, onHoverHouse }: SearchResultsMapInnerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chipsByHouse = useRef<Record<string, HTMLAnchorElement>>({});
  const theme = useTheme();
  const palette = useMemo(
    (): Palette => ({
      paper: theme.palette.background.paper,
      ink: theme.palette.text.primary,
      accent: theme.palette.primary.main,
      onAccent: theme.palette.primary.contrastText,
      border: theme.palette.divider,
      radius: Number.parseFloat(String(theme.shape.borderRadius)),
    }),
    [theme],
  );
  const { paper, ink, accent, onAccent } = palette;

  // Keep the latest callback without rebuilding the map every time the parent re-renders.
  const hoverRef = useRef(onHoverHouse);
  hoverRef.current = onHoverHouse;

  // --- Build the map and its chips when the results change ---
  useEffect((): (() => void) => {
    const node = containerRef.current;
    const first = pins[0];
    if (node === null || first === undefined) {
      return (): void => undefined;
    }
    const map = new Map({
      container: node,
      style: OSM_RASTER_STYLE,
      center: [first.longitude, first.latitude],
      zoom: 11,
      attributionControl: {},
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const markers: Marker[] = [];
    const chips: Record<string, HTMLAnchorElement> = {};
    const bounds = new LngLatBounds();
    for (const pin of pins) {
      const stack = document.createElement('div');
      Object.assign(stack.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' });
      const visible = pin.stays.length > MAX_VISIBLE_CHIPS ? pin.stays.slice(0, MAX_VISIBLE_CHIPS - 1) : pin.stays;
      for (const stay of visible) {
        const chip = stayChip(stay, palette, hoverRef);
        chips[stay.houseId] = chip;
        stack.appendChild(chip);
      }
      let popup: Popup | undefined;
      if (visible.length < pin.stays.length) {
        const more = moreChip(pin.stays.length - visible.length, palette);
        popup = new Popup({ offset: 12, closeButton: true }).setDOMContent(popupContent(pin));
        more.addEventListener('click', (): void => {
          popup?.setLngLat([pin.longitude, pin.latitude]).addTo(map);
        });
        stack.appendChild(more);
      }
      stack.appendChild(pointer(palette.accent));
      const marker = new Marker({ element: stack, anchor: 'bottom' }).setLngLat([pin.longitude, pin.latitude]).addTo(map);
      markers.push(marker);
      bounds.extend([pin.longitude, pin.latitude]);
    }
    chipsByHouse.current = chips;

    if (pins.length > 1) {
      map.fitBounds(bounds, { padding: 90, maxZoom: 13, duration: 0 });
    }
    const resize = (): void => {
      map.resize();
    };
    map.on('load', resize);
    const timeout = window.setTimeout(resize, 250);

    return (): void => {
      window.clearTimeout(timeout);
      markers.forEach((marker): void => {
        marker.remove();
      });
      chipsByHouse.current = {};
      map.remove();
    };
  }, [pins, palette]);

  // --- Highlight the active stay's chip without rebuilding anything ---
  useEffect((): void => {
    for (const [houseId, chip] of Object.entries(chipsByHouse.current)) {
      const active = houseId === activeHouseId;
      chip.style.background = active ? accent : paper;
      chip.style.color = active ? onAccent : ink;
      chip.style.transform = active ? 'scale(1.08)' : 'none';
      chip.style.zIndex = active ? '2' : '1';
    }
  }, [activeHouseId, pins, accent, onAccent, paper, ink]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} aria-label="Map of available stays" />;
}

/**
 * One stay as a chip: name and price, linking to the stay with the guest's dates.
 */
function stayChip(
  stay: MapPinStayView,
  palette: Palette,
  hover: { current: (houseId: string | null) => void },
): HTMLAnchorElement {
  const chip = document.createElement('a');
  chip.href = stay.href;
  chip.setAttribute('aria-label', `${stay.name}, ${stay.priceLabel}`);
  Object.assign(chip.style, chipStyle(palette));
  const name = document.createElement('span');
  name.textContent = stay.name;
  Object.assign(name.style, { maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '400' });
  const price = document.createElement('span');
  price.textContent = stay.priceLabel;
  chip.append(name, price);
  chip.addEventListener('mouseenter', (): void => hover.current(stay.houseId));
  chip.addEventListener('mouseleave', (): void => hover.current(null));
  chip.addEventListener('focus', (): void => hover.current(stay.houseId));
  chip.addEventListener('blur', (): void => hover.current(null));
  return chip;
}

function moreChip(count: number, palette: Palette): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `+${String(count)} more`;
  Object.assign(button.style, chipStyle(palette), { justifyContent: 'center', font: 'inherit', fontWeight: '600', fontSize: '13px' });
  return button;
}

function chipStyle(palette: Palette): Partial<CSSStyleDeclaration> {
  return {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    background: palette.paper,
    color: palette.ink,
    border: `1px solid ${palette.border}`,
    borderRadius: `${String(palette.radius)}px`,
    padding: '4px 10px',
    fontWeight: '600',
    fontSize: '13px',
    textDecoration: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
  };
}

/** A small downward arrow so the stack points at the exact place. */
function pointer(color: string): HTMLElement {
  const arrow = document.createElement('div');
  Object.assign(arrow.style, {
    width: '0',
    height: '0',
    borderLeft: '7px solid transparent',
    borderRight: '7px solid transparent',
    borderTop: `9px solid ${color}`,
  });
  return arrow;
}

/**
 * The full list for a crowded place, opened from "+N more". Built with DOM text nodes so a stay
 * name can never inject markup.
 */
function popupContent(pin: MapPinView): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.minWidth = '180px';
  for (const stay of pin.stays) {
    const link = document.createElement('a');
    link.href = stay.href;
    link.style.display = 'block';
    link.style.padding = '4px 0';
    link.style.fontWeight = '600';
    link.textContent = `${stay.name}: ${stay.priceLabel}`;
    wrapper.appendChild(link);
  }
  return wrapper;
}
