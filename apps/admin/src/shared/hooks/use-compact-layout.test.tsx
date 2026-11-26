// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/hooks/use-compact-layout.test.tsx
 * @shared Phone / small-tablet breakpoint hooks
 */

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompactLayout, usePhoneLayout } from './use-compact-layout';

/** A matchMedia whose "(max-width:Npx)" queries match when the pretend window is `width` wide. */
function stubWindow(width: number): void {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const matches = max === null ? false : width <= Number(max[1]);
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
}

describe('layout hooks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false without matchMedia (tests, server): the desktop structure', () => {
    expect(renderHook(() => useCompactLayout()).result.current).toBe(false);
    expect(renderHook(() => usePhoneLayout()).result.current).toBe(false);
  });

  it('is compact below 900px and a phone below 600px', () => {
    stubWindow(390);
    expect(renderHook(() => useCompactLayout()).result.current).toBe(true);
    expect(renderHook(() => usePhoneLayout()).result.current).toBe(true);

    stubWindow(768);
    expect(renderHook(() => useCompactLayout()).result.current).toBe(true);
    expect(renderHook(() => usePhoneLayout()).result.current).toBe(false);

    stubWindow(1280);
    expect(renderHook(() => useCompactLayout()).result.current).toBe(false);
  });
});
