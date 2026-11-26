/**
 * @file apps/api/src/modules/property/geocode-cache.ts
 * @feature property
 * @dependencies none
 */

/** How long a found place stays cached: addresses do not move, and it keeps repeats off the free upstream services. */
export const GEOCODE_CACHE_TTL_MS = 10 * 60 * 1000;

/** Most entries kept at once; the oldest goes first. A few hundred lookups of a few kilobytes each. */
export const GEOCODE_CACHE_MAX_ENTRIES = 500;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * A small in-memory cache with an expiry and a size cap (per process; nothing durable). Not Redis on purpose: a lost
 * entry only costs one more upstream call.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  public constructor(
    private readonly ttlMs: number = GEOCODE_CACHE_TTL_MS,
    private readonly maxEntries: number = GEOCODE_CACHE_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  /** The cached value, or undefined when missing or expired. */
  public get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Stores a value; at the size cap the oldest entry makes room. */
  public set(key: string, value: T): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** Entries held right now (including expired ones not yet looked up). */
  public get size(): number {
    return this.entries.size;
  }
}
