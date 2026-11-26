// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/photo-gallery.test.tsx
 * @shared Photo gallery: strip, viewer, keyboard and swipe navigation
 */

import type { Photo } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PhotoGallery } from './photo-gallery';

function photo(id: string): Photo {
  return { id, url: `https://images.unsplash.com/${id}?w=1600`, altText: `Alt ${id}`, sortOrder: 0 };
}

const PHOTOS = ['a', 'b', 'c'].map(photo);

describe('PhotoGallery', () => {
  afterEach(cleanup);

  it('says so when there are no photos', () => {
    render(<PhotoGallery photos={[]} altFallback="Chalet" />);

    expect(screen.getByText(/not available yet/i)).toBeTruthy();
  });

  it('renders every photo with a responsive srcset and lazy loading after the first', () => {
    render(<PhotoGallery photos={PHOTOS} altFallback="Chalet" />);

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    expect(images[0]?.getAttribute('loading')).toBe('eager');
    expect(images[1]?.getAttribute('loading')).toBe('lazy');
    expect(images[1]?.getAttribute('srcset')).toContain('480w');
  });

  it('labels the first tile so a screen reader knows it opens the viewer', () => {
    render(<PhotoGallery photos={PHOTOS} altFallback="Chalet" />);

    expect(screen.getByRole('button', { name: 'Open photo 1 of 3' })).toBeTruthy();
  });

  it('opens the viewer with a close button and steps with the arrows and the keyboard', async () => {
    render(<PhotoGallery photos={PHOTOS} altFallback="Chalet" />);

    await userEvent.click(screen.getByRole('button', { name: 'View photos' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close photo viewer' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText(/Alt b/)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    // wraps around to the last photo
    expect(screen.getByText(/Alt c/)).toBeTruthy();
  });

  it('moves to the next photo on a swipe left and ignores a vertical drag', async () => {
    render(<PhotoGallery photos={PHOTOS} altFallback="Chalet" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open photo 1 of 3' }));
    const viewerImage = screen.getAllByRole('img').find((img) => img.getAttribute('sizes')?.includes('900px'));
    const area = viewerImage?.parentElement;
    expect(area).toBeTruthy();
    if (area === null || area === undefined) {
      return;
    }

    fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 80, clientY: 110 }] });
    expect(screen.getByText(/Alt b/)).toBeTruthy();

    fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 190, clientY: 400 }] });
    expect(screen.getByText(/Alt b/)).toBeTruthy();
  });

  it('closes the viewer with the close button', async () => {
    render(<PhotoGallery photos={PHOTOS} altFallback="Chalet" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open photo 2 of 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close photo viewer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
