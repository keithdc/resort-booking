/**
 * @file apps/web/src/shared/utils/responsive.ts
 * @shared Phone/tablet helpers: breakpoints for JS, responsive image sets, swipes, motion preference
 * @dependencies none (pure, browser-safe)
 */

/** Phones in portrait, and phones turned sideways (short viewport). Dialogs go full-screen here. */
export const COMPACT_MEDIA_QUERY = '(max-width:599.95px), (max-height:500px)';

/** Phones and small tablets: below the layout's `md` breakpoint (900px). */
export const BELOW_DESKTOP_MEDIA_QUERY = '(max-width:899.95px)';

/** The date picker only uses its popup calendar with a wide screen and a precise pointer. */
export const DESKTOP_PICKER_MEDIA_QUERY = '(min-width:900px) and (pointer: fine)';

/** Widths a photo is offered at, in CSS pixels. */
const PHOTO_WIDTHS: readonly number[] = [480, 800, 1200, 1600];

/**
 * A `srcset` for photos on the Unsplash image CDN (it resizes with `w=`). Other hosts return
 * undefined, so the plain `src` is used unchanged. Phones then download 480-800px photos, not 1600px.
 */
export function photoSrcSet(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname !== 'images.unsplash.com') {
    return undefined;
  }
  return PHOTO_WIDTHS.map((width): string => {
    const variant = new URL(parsed.toString());
    variant.searchParams.set('w', String(width));
    return `${variant.toString()} ${String(width)}w`;
  }).join(', ');
}

export type SwipeDirection = 'left' | 'right' | null;

/** A horizontal swipe must travel this far (px) and be mostly sideways to count. */
const SWIPE_MIN_DISTANCE = 48;

/**
 * Reads a touch drag as "swipe left" (next), "swipe right" (previous) or nothing. Vertical drags
 * (scrolling) and short taps are ignored.
 */
export function swipeDirection(deltaX: number, deltaY: number): SwipeDirection {
  if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
    return null;
  }
  return deltaX < 0 ? 'left' : 'right';
}

/** True when the guest asked their device for less motion. Safe where matchMedia is missing. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** `behavior` for programmatic scrolls: instant for guests who asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/** Scrolls an element into view (does nothing for null, or where scrollIntoView is missing, e.g. jsdom). */
export function scrollToElement(element: Element | null, block: ScrollLogicalPosition = 'start'): void {
  if (element !== null && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: scrollBehavior(), block });
  }
}

/** Scrolls an element to the middle of the screen so a message or error is not left off-screen. */
export function revealElement(element: Element | null): void {
  scrollToElement(element, 'center');
}
