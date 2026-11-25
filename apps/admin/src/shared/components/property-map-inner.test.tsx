// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/components/property-map-inner.test.tsx
 * @shared The staff map: light vector basemap, gestures, draggable pin
 */

import { cleanup, render } from '@testing-library/react';
import { setWorkerUrl } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyMapInner } from './property-map-inner';

interface MapEvent {
  lngLat: { lat: number; lng: number };
}

const maplibre = vi.hoisted(() => {
  const state = {
    mapOptions: null as Record<string, unknown> | null,
    markerOptions: null as { element?: HTMLElement; anchor?: string; draggable?: boolean } | null,
    clickHandler: null as ((event: { lngLat: { lat: number; lng: number } }) => void) | null,
    handlers: [] as string[],
    controls: [] as { options: Record<string, unknown> | undefined }[],
    rotationDisabled: 0,
    removed: 0,
  };
  class FakeMap {
    public touchZoomRotate = { disableRotation: (): void => { state.rotationDisabled += 1; } };
    public constructor(options: Record<string, unknown>) {
      state.mapOptions = options;
    }
    public on(type: string, listener?: (event: { lngLat: { lat: number; lng: number } }) => void): this {
      state.handlers.push(type);
      if (type === 'click' && listener !== undefined) {
        state.clickHandler = listener;
      }
      return this;
    }
    public addControl(control: { options: Record<string, unknown> | undefined }): this {
      state.controls.push(control);
      return this;
    }
    public resize(): void {
      return;
    }
    public flyTo(): void {
      return;
    }
    public remove(): void {
      state.removed += 1;
    }
  }
  class FakeNavigationControl {
    public constructor(public options?: Record<string, unknown>) {}
  }
  class FakePopup {
    public setText(): this {
      return this;
    }
  }
  class FakeMarker {
    private readonly element: HTMLElement;
    public constructor(options: { element: HTMLElement; anchor?: string; draggable?: boolean }) {
      state.markerOptions = options;
      this.element = options.element;
    }
    public setLngLat(): this {
      return this;
    }
    public setPopup(): this {
      return this;
    }
    public getPopup(): FakePopup {
      return new FakePopup();
    }
    public getLngLat(): { lat: number; lng: number } {
      return { lat: 1, lng: 2 };
    }
    public getElement(): HTMLElement {
      return this.element;
    }
    public on(): this {
      return this;
    }
    public addTo(): this {
      document.body.appendChild(this.element);
      return this;
    }
  }
  return { state, FakeMap, FakeMarker, FakePopup, FakeNavigationControl };
});

vi.mock('maplibre-gl', () => ({
  Map: maplibre.FakeMap,
  Marker: maplibre.FakeMarker,
  Popup: maplibre.FakePopup,
  NavigationControl: maplibre.FakeNavigationControl,
  setWorkerUrl: vi.fn<(url: string) => void>(),
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

describe('PropertyMapInner (staff)', () => {
  beforeEach(() => {
    maplibre.state.mapOptions = null;
    maplibre.state.markerOptions = null;
    maplibre.state.clickHandler = null;
    maplibre.state.handlers = [];
    maplibre.state.controls = [];
    maplibre.state.rotationDisabled = 0;
    maplibre.state.removed = 0;
  });
  afterEach(cleanup);

  it('points MapLibre at the web worker served from /maplibre/ before it draws', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    expect(setWorkerUrl).toHaveBeenCalledWith(expect.stringMatching(/\/maplibre\/maplibre-gl-worker\.mjs$/));
  });

  it('draws the light vector basemap without rotation, and keeps the page scrollable', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    const options = maplibre.state.mapOptions;
    expect(options?.style).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(options?.attributionControl).toEqual({ compact: true });
    expect(options?.dragRotate).toBe(false);
    expect(options?.cooperativeGestures).toBe(true);
    expect(maplibre.state.rotationDisabled).toBe(1);
    expect(maplibre.state.controls[0]?.options).toEqual({ showCompass: false });
    expect(maplibre.state.handlers).toContain('error');
  });

  it('shows a named house pin, fixed when staff cannot move it', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    const pin = maplibre.state.markerOptions;
    expect(pin?.element?.getAttribute('role')).toBe('img');
    expect(pin?.element?.getAttribute('aria-label')).toBe('Alpine Lake');
    expect(pin?.anchor).toBe('center');
    expect(pin?.draggable).toBe(false);
  });

  it('lets staff drag the pin or click the map, and reports the new point', () => {
    const onPinChange = vi.fn<(latitude: number, longitude: number) => void>();
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" onPinChange={onPinChange} />);

    expect(maplibre.state.markerOptions?.draggable).toBe(true);
    const event: MapEvent = { lngLat: { lat: 46, lng: 7 } };
    maplibre.state.clickHandler?.(event);

    expect(onPinChange).toHaveBeenCalledWith(46, 7);
  });

  it('removes the map when it goes away', () => {
    const { unmount } = render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    unmount();

    expect(maplibre.state.removed).toBe(1);
  });
});
