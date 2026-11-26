// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/services/staff-session.test.ts
 * @shared Staff token storage
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STAFF_LAST_ACTIVE_STORAGE_KEY,
  STAFF_TOKEN_STORAGE_KEY,
  clearStoredStaffToken,
  readLastActive,
  readStoredStaffToken,
  storeStaffToken,
  writeLastActive,
} from './staff-session';

describe('staff-session', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('stores the token and starts the inactivity clock', () => {
    storeStaffToken('tok', 1234);

    expect(readStoredStaffToken()).toBe('tok');
    expect(window.localStorage.getItem(STAFF_TOKEN_STORAGE_KEY)).toBe('tok');
    expect(readLastActive()).toBe(1234);
  });

  it('forgets both on clear', () => {
    storeStaffToken('tok', 1);

    clearStoredStaffToken();

    expect(readStoredStaffToken()).toBe('');
    expect(readLastActive()).toBeNull();
  });

  it('reads an empty token and unknown activity from an empty store', () => {
    expect(readStoredStaffToken()).toBe('');
    expect(readLastActive()).toBeNull();
  });

  it('ignores a corrupt activity value', () => {
    window.localStorage.setItem(STAFF_LAST_ACTIVE_STORAGE_KEY, 'not a number');

    expect(readLastActive()).toBeNull();
  });

  it('records activity', () => {
    writeLastActive(99);

    expect(readLastActive()).toBe(99);
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

    expect(readStoredStaffToken()).toBe('');
    expect(readLastActive()).toBeNull();
    expect(() => storeStaffToken('tok')).not.toThrow();
    expect(() => writeLastActive()).not.toThrow();
    expect(() => clearStoredStaffToken()).not.toThrow();
  });
});
