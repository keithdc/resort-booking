// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/site-header.test.tsx
 * @shared Guest header navigation
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteHeader } from './site-header';

vi.mock('next/navigation', () => ({
  usePathname: (): string => '/',
}));

describe('SiteHeader', () => {
  afterEach(cleanup);

  it('links Properties to the real properties page, not just a spot on the home page', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Properties' }).getAttribute('href')).toBe('/properties');
  });

  it('offers a way to manage a booking from every page', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Manage booking' }).getAttribute('href')).toBe('/manage');
  });

  it('keeps Search stays pointing at the search area on the home page', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: /Search stays/ }).getAttribute('href')).toBe('/#search');
  });

  it('links the logo to the home page', () => {
    render(<SiteHeader />);

    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/')).toBe(true);
  });
});
