// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/utils/responsive.test.ts
 * @shared Responsive image sets, swipes and motion preference
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { photoSrcSet, prefersReducedMotion, revealElement, scrollBehavior, scrollToElement, swipeDirection } from './responsive';

describe('photoSrcSet', () => {
  it('offers several widths for an Unsplash photo and keeps the other parameters', () => {
    const set = photoSrcSet('https://images.unsplash.com/photo-1?auto=format&fit=crop&w=1600&q=80');

    expect(set).toBeDefined();
    expect(set).toContain('w=480');
    expect(set).toContain('480w');
    expect(set).toContain('1600w');
    expect(set).toContain('fit=crop');
    expect(set?.split(', ')).toHaveLength(4);
  });

  it('adds a width when the URL had none', () => {
    expect(photoSrcSet('https://images.unsplash.com/photo-2')).toContain('photo-2?w=800 800w');
  });

  it('leaves other hosts and bad URLs alone', () => {
    expect(photoSrcSet('https://cdn.example.com/a.jpg')).toBeUndefined();
    expect(photoSrcSet('not a url')).toBeUndefined();
    expect(photoSrcSet('')).toBeUndefined();
  });
});

describe('swipeDirection', () => {
  it('reads a long sideways drag as a swipe', () => {
    expect(swipeDirection(-80, 5)).toBe('left');
    expect(swipeDirection(80, -5)).toBe('right');
  });

  it('ignores taps, short drags and vertical scrolls', () => {
    expect(swipeDirection(0, 0)).toBeNull();
    expect(swipeDirection(-30, 0)).toBeNull();
    expect(swipeDirection(60, 120)).toBeNull();
  });

  it('counts exactly the minimum distance', () => {
    expect(swipeDirection(-48, 0)).toBe('left');
    expect(swipeDirection(-47, 0)).toBeNull();
  });
});

describe('motion preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubReduce(reduce: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }));
  }

  it('scrolls smoothly unless the guest asked for less motion', () => {
    stubReduce(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');

    stubReduce(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe('auto');
  });

  it('copes with a missing matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reveals an element in the middle of the screen, and ignores null', () => {
    stubReduce(true);
    const element = document.createElement('div');
    const scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    element.scrollIntoView = scrollIntoView;
    revealElement(element);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(() => revealElement(null)).not.toThrow();
  });

  it('scrolls to the start by default and survives an element without scrollIntoView', () => {
    stubReduce(false);
    const element = document.createElement('div');
    const scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    element.scrollIntoView = scrollIntoView;
    scrollToElement(element);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    // jsdom elements have no scrollIntoView at all
    expect(() => scrollToElement(document.createElement('p'))).not.toThrow();
  });
});
