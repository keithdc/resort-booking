/**
 * @file apps/admin/src/shared/hooks/use-sidebar-collapsed.ts
 * @shared Remembers whether the sidebar is the icon-only rail
 * @dependencies react
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

export const SIDEBAR_COLLAPSED_KEY = 'admin_sidebar_collapsed';

/**
 * Reads the saved choice. Storage can be blocked (private window, site data off): then it is simply "not collapsed".
 */
export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Saves the choice; failing to save is fine, the rail still works for this visit.
 */
export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Not remembered next time.
  }
}

interface SidebarCollapsedState {
  collapsed: boolean;
  toggle: () => void;
}

/**
 * Collapsed flag with persistence. It reads storage after mount so the server and the first client render agree.
 */
export function useSidebarCollapsed(): SidebarCollapsedState {
  const [collapsed, setCollapsed] = useState(false);

  useEffect((): void => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  const toggle = useCallback((): void => {
    setCollapsed((current: boolean): boolean => {
      const next = !current;
      saveSidebarCollapsed(next);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
