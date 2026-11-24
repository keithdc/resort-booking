// @vitest-environment jsdom
/**
 * @file apps/web/src/features/property/components/property-card-grid.test.tsx
 * @feature property
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PropertyCardGrid } from './property-card-grid';

function property(id: string, slug: string, name: string, coverPhotoUrl: string | null): PropertySummary {
  return {
    id,
    organizationId: 'o',
    slug,
    name,
    description: '',
    city: 'Annecy',
    countryCode: 'FR',
    latitude: 45.9,
    longitude: 6.1,
    phone: '+33450123456',
    email: 'stay@example.com',
    published: true,
    timezone: 'Europe/Paris',
    coverPhotoUrl,
    customRequestsEnabled: false,
    addressLine: '8 Route du Lac',
    postalCode: '74000',
  };
}

describe('PropertyCardGrid', () => {
  afterEach(cleanup);

  it('shows each property with its name, address and a link to its page', () => {
    render(
      <PropertyCardGrid
        properties={[
          property('1', 'alpine-lake', 'Alpine Lake', 'https://example.com/a.jpg'),
          property('2', 'pine-coast', 'Pine Coast', null),
        ]}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/properties/alpine-lake', '/properties/pine-coast']);
    expect(links[0]?.textContent).toContain('Alpine Lake');
    expect(links[0]?.textContent).toContain('8 Route du Lac');
    expect(links[0]?.textContent).toContain('See stays');
  });

  it('shows the photo when there is one and still renders a card when there is not', () => {
    render(
      <PropertyCardGrid
        properties={[
          property('1', 'alpine-lake', 'Alpine Lake', 'https://example.com/a.jpg'),
          property('2', 'pine-coast', 'Pine Coast', null),
        ]}
      />,
    );

    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('says so when no property is published yet, instead of a blank area', () => {
    render(<PropertyCardGrid properties={[]} />);

    expect(screen.getByText('No published properties yet.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
