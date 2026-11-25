/**
 * @file apps/admin/src/shared/components/nav-match.test.ts
 * @shared Sidebar active matching
 */

import { describe, expect, it } from 'vitest';
import { NAV_GROUPS } from './nav-config';
import { isNavActive } from './nav-match';

describe('isNavActive', () => {
  it('matches the calendar only on the home page', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/', '/refunds')).toBe(false);
  });

  it('matches a section and everything under it', () => {
    expect(isNavActive('/properties', '/properties')).toBe(true);
    expect(isNavActive('/properties', '/properties/abc')).toBe(true);
    expect(isNavActive('/properties', '/properties/new')).toBe(true);
  });

  it('does not match a path that merely starts with the same letters', () => {
    expect(isNavActive('/refunds', '/refunds-archive')).toBe(false);
    expect(isNavActive('/reports', '/refunds')).toBe(false);
  });

  it('marks exactly one item for every real page', () => {
    const items = NAV_GROUPS.flatMap((group) => group.items);
    for (const pathname of ['/', '/refunds', '/reports', '/properties', '/properties/x', '/configuration']) {
      expect(items.filter((item) => isNavActive(item.href, pathname))).toHaveLength(1);
    }
  });
});

describe('NAV_GROUPS', () => {
  it('has unique keys and links, each with an idle and an active icon', () => {
    const items = NAV_GROUPS.flatMap((group) => group.items);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    for (const item of items) {
      expect(item.idleIcon).toBeTruthy();
      expect(item.activeIcon).toBeTruthy();
    }
  });
});
