// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/hooks/use-idle-logout.test.tsx
 * @shared Idle sign-out hook
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLastActive, writeLastActive } from '@/shared/services/activity-clock';
import { useIdleLogout } from './use-idle-logout';

const LIMIT = 60_000;
const CHECK = 1_000;

describe('useIdleLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('calls onIdle once when there was no activity for the limit', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout({ enabled: true, onIdle, limitMs: LIMIT, checkEveryMs: CHECK }));

    act(() => {
      vi.advanceTimersByTime(LIMIT - CHECK);
    });
    expect(onIdle).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(CHECK * 5);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(LIMIT * 2);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('stays signed in while the user is active', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout({ enabled: true, onIdle, limitMs: LIMIT, checkEveryMs: CHECK }));

    for (let minute = 0; minute < 5; minute += 1) {
      act(() => {
        vi.advanceTimersByTime(LIMIT - 20_000);
        window.dispatchEvent(new Event('pointerdown'));
      });
    }

    expect(onIdle).not.toHaveBeenCalled();
    expect(readLastActive()).toBeGreaterThan(1_000_000 + LIMIT * 3);
  });

  it('counts activity from another tab (shared through storage)', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout({ enabled: true, onIdle, limitMs: LIMIT, checkEveryMs: CHECK }));

    act(() => {
      vi.advanceTimersByTime(LIMIT - 2_000);
      writeLastActive(Date.now());
      vi.advanceTimersByTime(LIMIT - 2_000);
    });

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('does nothing when disabled (login page)', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout({ enabled: false, onIdle, limitMs: LIMIT, checkEveryMs: CHECK }));

    act(() => {
      vi.advanceTimersByTime(LIMIT * 3);
    });

    expect(onIdle).not.toHaveBeenCalled();
    expect(readLastActive()).toBeNull();
  });

  it('stops watching when the component goes away', () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() => useIdleLogout({ enabled: true, onIdle, limitMs: LIMIT, checkEveryMs: CHECK }));
    unmount();

    act(() => {
      vi.advanceTimersByTime(LIMIT * 3);
    });

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('pings the API while the user is active, and never while the tab sits idle', () => {
    const onKeepAlive = vi.fn();
    renderHook(() =>
      useIdleLogout({ enabled: true, onIdle: vi.fn(), onKeepAlive, limitMs: LIMIT * 100, checkEveryMs: CHECK, keepAliveMs: 10_000 }),
    );

    act(() => {
      vi.advanceTimersByTime(10_500);
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(1_500);
    });
    expect(onKeepAlive).toHaveBeenCalledTimes(1);

    // No activity since the ping: no more pings.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onKeepAlive).toHaveBeenCalledTimes(1);
  });
});
