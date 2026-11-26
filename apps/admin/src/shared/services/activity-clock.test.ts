// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/services/activity-clock.test.ts
 * @shared Activity clock (the only session-related localStorage entry; a timestamp, never a token)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_LAST_ACTIVE_STORAGE_KEY, clearLastActive, readLastActive, writeLastActive } from './activity-clock';

describe('activity-clock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('records activity and reads it back', () => {
    writeLastActive(99);

    expect(readLastActive()).toBe(99);
    expect(window.localStorage.getItem(STAFF_LAST_ACTIVE_STORAGE_KEY)).toBe('99');
  });

  it('forgets the time on clear, and reads unknown from an empty store', () => {
    expect(readLastActive()).toBeNull();
    writeLastActive(1);

    clearLastActive();

    expect(readLastActive()).toBeNull();
  });

  it('ignores a corrupt value', () => {
    window.localStorage.setItem(STAFF_LAST_ACTIVE_STORAGE_KEY, 'not a number');

    expect(readLastActive()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readLastActive()).toBeNull();
    expect(() => writeLastActive()).not.toThrow();
    expect(() => clearLastActive()).not.toThrow();
  });
});
