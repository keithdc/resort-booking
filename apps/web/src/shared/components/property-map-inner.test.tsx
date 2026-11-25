// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/property-map-inner.test.tsx
 * @shared The single-place map: basemap, gestures, pin
 */

import { cleanup, render } from '@testing-library/react';
import { setWorkerUrl } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyMapInner } from './property-map-inner';

const maplibre = vi.hoisted(() => {
  const state = {
    mapOptions: null as Record<string, unknown> | null,
    removed: 0,
    rotationDisabled: 0,
    controls: [] as { options: Record<string, unknown> | undefined }[],
    markerOptions: null as { element?: HTMLElement; anchor?: string } | null,
    handlers: [] as string[],
  };
  class FakeMap {
    public touchZoomRotate = { disableRotation: (): void => { state.rotationDisabled += 1; } };
    public constructor(options: Record<string, unknown>) {
      state.mapOptions = options;
    }
    public on(type: string): this {
      state.handlers.push(type);
      return this;
    }
    public addControl(control: { options: Record<string, unknown> | undefined }): this {
      state.controls.push(control);
      return this;
    }
    public resize(): void {
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
    public constructor(options: { element?: HTMLElement; anchor?: string }) {
      state.markerOptions = options;
    }
    public setLngLat(): this {
      return this;
    }
    public setPopup(): this {
      return this;
    }
    public addTo(): this {
      return this;
    }
  }
  return { state, FakeMap, FakeNavigationControl, FakePopup, FakeMarker };
});

vi.mock('maplibre-gl', () => ({
  Map: maplibre.FakeMap,
  Marker: maplibre.FakeMarker,
  Popup: maplibre.FakePopup,
  NavigationControl: maplibre.FakeNavigationControl,
  setWorkerUrl: vi.fn<(url: string) => void>(),
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

describe('PropertyMapInner', () => {
  beforeEach(() => {
    maplibre.state.mapOptions = null;
    maplibre.state.markerOptions = null;
    maplibre.state.controls = [];
    maplibre.state.handlers = [];
    maplibre.state.removed = 0;
    maplibre.state.rotationDisabled = 0;
  });
  afterEach(cleanup);

  it('points MapLibre at the web worker served from /maplibre/ before it draws', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    expect(setWorkerUrl).toHaveBeenCalledWith(expect.stringMatching(/\/maplibre\/maplibre-gl-worker\.mjs$/));
  });

  it('draws the light vector basemap with a compact attribution and no rotation', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    const options = maplibre.state.mapOptions;
    expect(options?.style).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(options?.attributionControl).toEqual({ compact: true });
    expect(options?.dragRotate).toBe(false);
    expect(options?.pitchWithRotate).toBe(false);
    expect(maplibre.state.rotationDisabled).toBe(1);
  });

  it('lets the page scroll: the map zooms only with ctrl/cmd + scroll', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    expect(maplibre.state.mapOptions?.cooperativeGestures).toBe(true);
  });

  it('adds zoom buttons without the compass and falls back to raster tiles if the style fails', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    expect(maplibre.state.controls).toHaveLength(1);
    expect(maplibre.state.controls[0]?.options).toEqual({ showCompass: false });
    expect(maplibre.state.handlers).toContain('error');
    expect(maplibre.state.handlers).toContain('style.load');
  });

  it('marks the place with a named image pin, centered on the point', () => {
    render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    const pin = maplibre.state.markerOptions?.element;
    expect(pin?.getAttribute('role')).toBe('img');
    expect(pin?.getAttribute('aria-label')).toBe('Alpine Lake');
    expect(pin?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(maplibre.state.markerOptions?.anchor).toBe('center');
  });

  it('removes the map when it goes away', () => {
    const { unmount } = render(<PropertyMapInner latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    unmount();

    expect(maplibre.state.removed).toBe(1);
  });
});
