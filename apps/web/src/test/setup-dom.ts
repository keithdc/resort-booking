/**
 * @file apps/web/src/test/setup-dom.ts
 * @shared Test setup: browser observers that jsdom does not provide
 */

import { vi } from 'vitest';

/** Does nothing; enough for components that only need the observer to exist. */
class NoopObserver {
  public readonly root = null;
  public readonly rootMargin = '';
  public readonly thresholds: readonly number[] = [];
  public observe(): void {
    return;
  }
  public unobserve(): void {
    return;
  }
  public disconnect(): void {
    return;
  }
  public takeRecords(): never[] {
    return [];
  }
}

vi.stubGlobal('ResizeObserver', NoopObserver);
vi.stubGlobal('IntersectionObserver', NoopObserver);
