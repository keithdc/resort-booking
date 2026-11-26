// @vitest-environment jsdom
/**
 * @file apps/web/src/app/not-found.test.tsx
 * @shared Guest 404 page
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NotFound from './not-found';

describe('NotFound', () => {
  afterEach(cleanup);

  it('says the page is missing and links home and to the properties', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain("can't find");
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Our properties' }).getAttribute('href')).toBe('/properties');
  });
});
