// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/search-results-map-inner.test.tsx
 * @feature houses
 */

import { cleanup, render } from '@testing-library/react';
import { setWorkerUrl } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapPinView } from '../utils/map-pins';
import { MAX_VISIBLE_CHIPS, SearchResultsMapInner } from './search-results-map-inner';

const maplibre = vi.hoisted(() => {
  const state = {
    mapOptions: null as Record<string, unknown> | null,
    elements: [] as HTMLElement[],
    handlers: [] as string[],
    rotationDisabled: 0,
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
    public addControl(): this {
      return this;
    }
    public fitBounds(): this {
      return this;
    }
    public resize(): void {
      return;
    }
    public remove(): void {
      return;
    }
  }
  class FakeMarker {
    public constructor(options: { element: HTMLElement }) {
      state.elements.push(options.element);
    }
    public setLngLat(): this {
      return this;
    }
    public addTo(): this {
      return this;
    }
    public remove(): void {
      return;
    }
  }
  class FakeBounds {
    public extend(): this {
      return this;
    }
  }
  class FakePopup {
    public setDOMContent(): this {
      return this;
    }
    public setLngLat(): this {
      return this;
    }
    public addTo(): this {
      return this;
    }
  }
  class FakeNavigationControl {}
  return { state, FakeMap, FakeMarker, FakeBounds, FakePopup, FakeNavigationControl };
});

vi.mock('maplibre-gl', () => ({
  Map: maplibre.FakeMap,
  Marker: maplibre.FakeMarker,
  LngLatBounds: maplibre.FakeBounds,
  Popup: maplibre.FakePopup,
  NavigationControl: maplibre.FakeNavigationControl,
  setWorkerUrl: vi.fn<(url: string) => void>(),
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

function pin(count: number): MapPinView {
  return {
    key: 'p',
    latitude: 45.9,
    longitude: 6.1,
    stays: Array.from({ length: count }, (_, index) => ({
      houseId: `h${String(index)}`,
      name: `Stay ${String(index)}`,
      priceLabel: `${String(100 + index)},00 €`,
      href: `/properties/p/stays/s${String(index)}`,
    })),
  };
}

function chips(): HTMLAnchorElement[] {
  return maplibre.state.elements.flatMap((element) => Array.from(element.querySelectorAll('a')));
}

describe('SearchResultsMapInner', () => {
  beforeEach(() => {
    maplibre.state.mapOptions = null;
    maplibre.state.elements = [];
    maplibre.state.handlers = [];
    maplibre.state.rotationDisabled = 0;
  });
  afterEach(cleanup);

  it('points MapLibre at the web worker served from /maplibre/ before it draws', () => {
    render(<SearchResultsMapInner pins={[pin(1)]} activeHouseId={null} onHoverHouse={vi.fn<(id: string | null) => void>()} />);

    expect(setWorkerUrl).toHaveBeenCalledWith(expect.stringMatching(/\/maplibre\/maplibre-gl-worker\.mjs$/));
  });

  it('uses the light vector basemap, no rotation, and the raster fallback', () => {
    render(<SearchResultsMapInner pins={[pin(1)]} activeHouseId={null} onHoverHouse={vi.fn<(id: string | null) => void>()} />);

    expect(maplibre.state.mapOptions?.style).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(maplibre.state.mapOptions?.attributionControl).toEqual({ compact: true });
    expect(maplibre.state.mapOptions?.dragRotate).toBe(false);
    expect(maplibre.state.rotationDisabled).toBe(1);
    expect(maplibre.state.handlers).toContain('error');
  });

  it('draws each stay as a white pill with its name and price, linking to the stay', () => {
    render(<SearchResultsMapInner pins={[pin(2)]} activeHouseId={null} onHoverHouse={vi.fn<(id: string | null) => void>()} />);

    const [first] = chips();
    expect(first?.textContent).toBe('Stay 0100,00 €');
    expect(first?.getAttribute('aria-label')).toBe('Stay 0, 100,00 €');
    expect(first?.getAttribute('href')).toBe('/properties/p/stays/s0');
    expect(first?.style.borderRadius).toBe('999px');
    expect(first?.style.fontWeight).toBe('700');
    expect(first?.dataset.active).toBe('false');
  });

  it('turns only the active stay dark and slightly larger', () => {
    render(<SearchResultsMapInner pins={[pin(2)]} activeHouseId="h1" onHoverHouse={vi.fn<(id: string | null) => void>()} />);

    const [first, second] = chips();
    expect(first?.dataset.active).toBe('false');
    expect(second?.dataset.active).toBe('true');
    expect(second?.style.transform).toBe('scale(1.08)');
    expect(first?.style.transform).toBe('none');
    expect(second?.style.background).not.toBe(first?.style.background);
  });

  it('collapses a crowded place into a "+N more" pill', () => {
    render(<SearchResultsMapInner pins={[pin(MAX_VISIBLE_CHIPS + 2)]} activeHouseId={null} onHoverHouse={vi.fn<(id: string | null) => void>()} />);

    expect(chips()).toHaveLength(MAX_VISIBLE_CHIPS - 1);
    const more = maplibre.state.elements[0]?.querySelector('button');
    expect(more?.textContent).toBe('+3 more');
  });

  it('tells the page which stay is under the mouse', () => {
    const onHover = vi.fn<(id: string | null) => void>();
    render(<SearchResultsMapInner pins={[pin(1)]} activeHouseId={null} onHoverHouse={onHover} />);

    const [chip] = chips();
    chip?.dispatchEvent(new MouseEvent('mouseenter'));
    chip?.dispatchEvent(new MouseEvent('mouseleave'));

    expect(onHover).toHaveBeenNthCalledWith(1, 'h0');
    expect(onHover).toHaveBeenNthCalledWith(2, null);
  });
});
