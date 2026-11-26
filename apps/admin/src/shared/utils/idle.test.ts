/**
 * @file apps/admin/src/shared/utils/idle.test.ts
 * @shared Idle helpers
 */

import { describe, expect, it } from 'vitest';
import { ACTIVITY_WRITE_THROTTLE_MS, STAFF_IDLE_LIMIT_MS, isIdle, shouldWriteActivity } from './idle';

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
