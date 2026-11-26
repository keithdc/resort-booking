// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/search-edit-sheet.test.tsx
 * @feature houses
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchEditSheet } from './search-edit-sheet';

const params = vi.hoisted(() => ({ current: 'checkIn=2026-12-10' }));

vi.mock('next/navigation', () => ({
  useSearchParams: (): URLSearchParams => new URLSearchParams(params.current),
}));

describe('SearchEditSheet', () => {
  afterEach(() => {
    cleanup();
    params.current = 'checkIn=2026-12-10';
  });

  it('shows the one-line summary as a button on a phone', () => {
    render(
      <SearchEditSheet summary="10 Dec – 12 Dec · 2 guests">
        <form aria-label="Search form" />
      </SearchEditSheet>,
    );

    expect(screen.getByRole('button', { name: /10 Dec – 12 Dec · 2 guests/ })).toBeTruthy();
  });

  it('opens the form in a bottom sheet with a close button', async () => {
    render(
      <SearchEditSheet summary="10 Dec – 12 Dec · 2 guests">
        <button type="button">Search</button>
      </SearchEditSheet>,
    );
    // The inline (desktop) copy is the only form until the sheet opens.
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /10 Dec/ }));

    expect(screen.getByRole('heading', { name: 'Change your search' })).toBeTruthy();
    // Open: the page behind is hidden from assistive tech, the sheet holds the form.
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Close search' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Change your search' })).toBeNull());
  });

  it('closes itself when a new search changes the address', async () => {
    const { rerender } = render(
      <SearchEditSheet summary="s">
        <p>form</p>
      </SearchEditSheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: /s/ }));
    expect(screen.getByRole('heading', { name: 'Change your search' })).toBeTruthy();

    params.current = 'checkIn=2026-12-20';
    rerender(
      <SearchEditSheet summary="s">
        <p>form</p>
      </SearchEditSheet>,
    );

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Change your search' })).toBeNull());
  });
});
