/**
 * @file apps/admin/src/shared/hooks/use-idle-logout.ts
 * @shared Signs staff out after a period without activity (any tab counts)
 * @dependencies activity-clock, idle
 */

'use client';

import { useEffect, useRef } from 'react';
import { readLastActive, writeLastActive } from '@/shared/services/activity-clock';
import { STAFF_IDLE_CHECK_MS, STAFF_IDLE_LIMIT_MS, STAFF_KEEP_ALIVE_MS, isIdle, shouldKeepAlive, shouldWriteActivity } from '@/shared/utils/idle';

const ACTIVITY_EVENTS: readonly string[] = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'visibilitychange'];

interface UseIdleLogoutOptions {
  /** Off on the login page. */
  enabled: boolean;
  onIdle: () => void;
  /**
   * While the person is active, called about every `keepAliveMs`. The API ends a session after 30 minutes without ANY
   * request (docs/13 R2-08), so a person typing in a long form must not be signed out by the server.
   */
  onKeepAlive?: () => void;
  limitMs?: number;
  checkEveryMs?: number;
  keepAliveMs?: number;
}

/**
 * Watches for activity and calls `onIdle` once when none was seen for `limitMs`. Activity is shared between
 * tabs through storage, so working in one tab keeps the others signed in.
 */
export function useIdleLogout({
  enabled,
  onIdle,
  onKeepAlive,
  limitMs = STAFF_IDLE_LIMIT_MS,
  checkEveryMs = STAFF_IDLE_CHECK_MS,
  keepAliveMs = STAFF_KEEP_ALIVE_MS,
}: UseIdleLogoutOptions): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const onKeepAliveRef = useRef(onKeepAlive);
  onKeepAliveRef.current = onKeepAlive;

  useEffect((): (() => void) => {
    if (!enabled) {
      return (): void => {
        return;
      };
    }
    let lastWritten: number | null = null;
    let fired = false;
    let lastKeepAlive = Date.now();
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
      const now = Date.now();
      const lastActive = readLastActive();
      if (!fired && isIdle(lastActive, now, limitMs)) {
        fired = true;
        onIdleRef.current();
      } else if (!fired && shouldKeepAlive(lastActive, lastKeepAlive, now, keepAliveMs)) {
        lastKeepAlive = now;
        onKeepAliveRef.current?.();
      }
    }, checkEveryMs);
    return (): void => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, note);
      }
    };
  }, [enabled, limitMs, checkEveryMs, keepAliveMs]);
}
