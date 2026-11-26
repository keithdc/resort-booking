// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/property-map.test.tsx
 * @shared PropertyMap external links
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertyMap } from './property-map';

vi.mock('./property-map-inner', () => ({
  PropertyMapInner: (): React.JSX.Element => <div>map canvas</div>,
}));

describe('PropertyMap', () => {
  afterEach(cleanup);

  it('opens every external map link in a new tab without giving the other site access to this one (S-20)', () => {
    render(<PropertyMap latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    const links = ['OpenStreetMap', 'Google Maps', 'Apple Maps'].map((name) => screen.getByRole('link', { name }));
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      const rel = (link.getAttribute('rel') ?? '').split(' ');
      expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    }
  });

  it('puts the coordinates in the links', () => {
    render(<PropertyMap latitude={45.9} longitude={6.1} label="Alpine Lake" />);

    expect(screen.getByRole('link', { name: 'Google Maps' }).getAttribute('href')).toContain('45.9,6.1');
  });
});
