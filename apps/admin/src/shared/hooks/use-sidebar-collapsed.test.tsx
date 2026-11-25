// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/hooks/use-sidebar-collapsed.test.tsx
 * @shared Sidebar collapse persistence
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSidebarCollapsed, saveSidebarCollapsed, SIDEBAR_COLLAPSED_KEY, useSidebarCollapsed } from './use-sidebar-collapsed';

describe('sidebar collapse storage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('starts open and remembers the choice', () => {
    expect(readSidebarCollapsed()).toBe(false);
    saveSidebarCollapsed(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    expect(readSidebarCollapsed()).toBe(true);
    saveSidebarCollapsed(false);
    expect(readSidebarCollapsed()).toBe(false);
  });

  it('reads the saved choice after mount and toggles it', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');

    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('0');
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readSidebarCollapsed()).toBe(false);
    expect(() => saveSidebarCollapsed(true)).not.toThrow();

    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
  });
});
