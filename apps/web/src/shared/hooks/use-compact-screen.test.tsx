// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/hooks/use-compact-screen.test.tsx
 * @shared Phone-screen hooks follow the media query
 */

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BELOW_DESKTOP_MEDIA_QUERY, COMPACT_MEDIA_QUERY } from '../utils/responsive';
import { useBelowDesktop, useCompactScreen } from './use-compact-screen';

/** A matchMedia that says "matches" for exactly the queries listed. */
function stubMedia(matching: readonly string[]): void {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  }));
}

describe('use-compact-screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true on a phone-sized viewport', () => {
    stubMedia([COMPACT_MEDIA_QUERY, BELOW_DESKTOP_MEDIA_QUERY]);

    expect(renderHook(() => useCompactScreen()).result.current).toBe(true);
    expect(renderHook(() => useBelowDesktop()).result.current).toBe(true);
  });

  it('is false on a desktop viewport', () => {
    stubMedia([]);

    expect(renderHook(() => useCompactScreen()).result.current).toBe(false);
    expect(renderHook(() => useBelowDesktop()).result.current).toBe(false);
  });

  it('separates a tablet (below desktop) from a phone (compact)', () => {
    stubMedia([BELOW_DESKTOP_MEDIA_QUERY]);

    expect(renderHook(() => useCompactScreen()).result.current).toBe(false);
    expect(renderHook(() => useBelowDesktop()).result.current).toBe(true);
  });

  it('is false where matchMedia does not exist', () => {
    expect(renderHook(() => useCompactScreen()).result.current).toBe(false);
  });
});
