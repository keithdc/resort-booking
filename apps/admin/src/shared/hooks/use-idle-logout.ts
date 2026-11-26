/**
 * @file apps/admin/src/shared/hooks/use-idle-logout.ts
 * @shared Signs staff out after a period without activity (any tab counts)
 * @dependencies staff-session, idle
 */

'use client';

import { useEffect, useRef } from 'react';
import { readLastActive, writeLastActive } from '@/shared/services/staff-session';
import { STAFF_IDLE_CHECK_MS, STAFF_IDLE_LIMIT_MS, isIdle, shouldWriteActivity } from '@/shared/utils/idle';

const ACTIVITY_EVENTS: readonly string[] = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'visibilitychange'];

interface UseIdleLogoutOptions {
  /** Off on the login page. */
  enabled: boolean;
  onIdle: () => void;
  limitMs?: number;
  checkEveryMs?: number;
}

/**
 * Watches for activity and calls `onIdle` once when none was seen for `limitMs`. Activity is shared between
 * tabs through storage, so working in one tab keeps the others signed in.
 */
export function useIdleLogout({ enabled, onIdle, limitMs = STAFF_IDLE_LIMIT_MS, checkEveryMs = STAFF_IDLE_CHECK_MS }: UseIdleLogoutOptions): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect((): (() => void) => {
    if (!enabled) {
      return (): void => {
        return;
      };
    }
    let lastWritten: number | null = null;
    let fired = false;
    const note = (): void => {
      const now = Date.now();
      if (shouldWriteActivity(lastWritten, now)) {
        lastWritten = now;
        writeLastActive(now);
      }
    };
    note();
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, note, { passive: true });
    }
    const timer = window.setInterval((): void => {
      if (!fired && isIdle(readLastActive(), Date.now(), limitMs)) {
        fired = true;
        onIdleRef.current();
      }
    }, checkEveryMs);
    return (): void => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, note);
      }
    };
  }, [enabled, limitMs, checkEveryMs]);
}
