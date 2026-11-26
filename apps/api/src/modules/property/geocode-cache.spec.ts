/**
 * @file apps/api/src/modules/property/geocode-cache.spec.ts
 * @feature property
 */

import { TtlCache } from './geocode-cache';

describe('TtlCache', () => {
  it('returns a stored value until it expires, then forgets it', () => {
    let clock = 1_000;
    const cache = new TtlCache<string>(100, 10, () => clock);

    cache.set('a', 'one');
    expect(cache.get('a')).toBe('one');
    clock += 99;
    expect(cache.get('a')).toBe('one');
    clock += 1;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('is undefined for a key never stored', () => {
    expect(new TtlCache<string>().get('missing')).toBeUndefined();
  });

  it('drops the oldest entry at the size cap', () => {
    const cache = new TtlCache<number>(1000, 2, () => 0);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('refreshes an overwritten key instead of growing', () => {
    const cache = new TtlCache<number>(1000, 2, () => 0);

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
  });
});
