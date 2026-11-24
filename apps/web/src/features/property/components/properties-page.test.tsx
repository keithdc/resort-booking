// @vitest-environment jsdom
/**
 * @file apps/web/src/features/property/components/properties-page.test.tsx
 * @feature property
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertiesPage } from './properties-page';

const api = vi.hoisted(() => ({
  fetchProperties: vi.fn<() => Promise<PropertySummary[]>>(),
}));

vi.mock('../services/property-api', () => api);

function property(slug: string, name: string): PropertySummary {
  return {
    id: slug,
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
    coverPhotoUrl: null,
    customRequestsEnabled: false,
    addressLine: '8 Route du Lac',
    postalCode: '74000',
  };
}

describe('PropertiesPage', () => {
  beforeEach(() => {
    api.fetchProperties.mockReset();
  });

  afterEach(cleanup);

  it('has a real heading and lists every published property', async () => {
    api.fetchProperties.mockResolvedValue([property('alpine-lake', 'Alpine Lake'), property('pine-coast', 'Pine Coast')]);

    render(await PropertiesPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Our properties' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Alpine Lake/ }).getAttribute('href')).toBe('/properties/alpine-lake');
    expect(screen.getByRole('link', { name: /Pine Coast/ }).getAttribute('href')).toBe('/properties/pine-coast');
  });

  it('shows the empty message when nothing is published', async () => {
    api.fetchProperties.mockResolvedValue([]);

    render(await PropertiesPage());

    expect(screen.getByText('No published properties yet.')).toBeTruthy();
  });
});
