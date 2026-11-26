/**
 * @file apps/admin/src/shared/utils/idle.test.ts
 * @shared Idle helpers
 */

import { describe, expect, it } from 'vitest';
import { ACTIVITY_WRITE_THROTTLE_MS, STAFF_IDLE_LIMIT_MS, STAFF_KEEP_ALIVE_MS, isIdle, shouldKeepAlive, shouldWriteActivity } from './idle';

describe('isIdle', () => {
  const now = 1_000_000_000;

  it('is not idle before the limit and idle at and after it', () => {
    expect(isIdle(now - (STAFF_IDLE_LIMIT_MS - 1), now)).toBe(false);
    expect(isIdle(now - STAFF_IDLE_LIMIT_MS, now)).toBe(true);
    expect(isIdle(now - STAFF_IDLE_LIMIT_MS * 3, now)).toBe(true);
  });

  it('treats unknown activity as active', () => {
    expect(isIdle(null, now)).toBe(false);
  });

  it('takes a custom limit', () => {
    expect(isIdle(now - 5_000, now, 5_000)).toBe(true);
    expect(isIdle(now - 4_999, now, 5_000)).toBe(false);
  });

  it('defaults to 30 minutes', () => {
    expect(STAFF_IDLE_LIMIT_MS).toBe(30 * 60 * 1000);
  });
});

describe('shouldWriteActivity', () => {
  it('writes the first time, then at most once per throttle window', () => {
    expect(shouldWriteActivity(null, 100)).toBe(true);
    expect(shouldWriteActivity(100, 100 + ACTIVITY_WRITE_THROTTLE_MS - 1)).toBe(false);
    expect(shouldWriteActivity(100, 100 + ACTIVITY_WRITE_THROTTLE_MS)).toBe(true);
  });
});

describe('shouldKeepAlive', () => {
  it('pings an active person once a period, and never an idle tab', () => {
    expect(shouldKeepAlive(1_000, 0, 9_999, 10_000)).toBe(false);
    expect(shouldKeepAlive(1_000, 0, 10_000, 10_000)).toBe(true);
    // Nothing happened since the last ping: stay quiet.
    expect(shouldKeepAlive(500, 1_000, 50_000, 10_000)).toBe(false);
    expect(shouldKeepAlive(null, 0, 50_000, 10_000)).toBe(false);
  });

  it('defaults to every 10 minutes, well inside the 30 minute server idle limit', () => {
    expect(STAFF_KEEP_ALIVE_MS).toBe(10 * 60 * 1000);
    expect(STAFF_KEEP_ALIVE_MS).toBeLessThan(STAFF_IDLE_LIMIT_MS);
  });
});
