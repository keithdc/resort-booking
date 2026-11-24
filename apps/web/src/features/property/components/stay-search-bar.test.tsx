// @vitest-environment jsdom
/**
 * @file apps/web/src/features/property/components/stay-search-bar.test.tsx
 * @feature property
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaySearchBar } from './stay-search-bar';

const router = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));

vi.mock('next/navigation', () => ({ useRouter: (): typeof router => router }));
vi.mock('@/shared/hooks/use-availability', () => ({
  usePropertyUnavailable: (): { unavailable: never[]; refresh: () => void } => ({ unavailable: [], refresh: (): void => undefined }),
}));
vi.mock('@/shared/components/stay-date-field', () => ({
  StayDateField: ({ value }: { value: string }): React.JSX.Element => <input aria-label="Check-in" readOnly value={value} />,
}));

const INITIAL = { checkIn: '2099-07-10', checkOut: '2099-07-12', nights: '2', guestCount: '3', propertySlug: 'alpine-lake' };

describe('StaySearchBar', () => {
  beforeEach(() => {
    router.push.mockReset();
  });

  afterEach(cleanup);

  it('keeps the plain "Search" copy and goes to the search page by default', () => {
    render(<StaySearchBar initial={INITIAL} />);

    expect(screen.queryByRole('heading')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(router.push).toHaveBeenCalledWith(
      '/search?checkIn=2099-07-10&checkOut=2099-07-12&nights=2&guestCount=3&property=alpine-lake',
    );
  });

  it('names the property and the action in the property variant', () => {
    render(<StaySearchBar initial={INITIAL} variant="property" propertyName="Alpine Lake" />);

    expect(screen.getByRole('heading', { name: 'Check availability at Alpine Lake' })).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Check availability at Alpine Lake' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check availability' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('checks availability in place: same property page, dates in the query, never /search', () => {
    render(<StaySearchBar initial={INITIAL} variant="property" propertyName="Alpine Lake" />);

    fireEvent.click(screen.getByRole('button', { name: 'Check availability' }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/properties/alpine-lake?checkIn=2099-07-10&checkOut=2099-07-12&nights=2&guestCount=3');
  });

  it('uses the new nights and guests when the guest changes them', () => {
    render(<StaySearchBar initial={INITIAL} variant="property" propertyName="Alpine Lake" />);

    fireEvent.change(screen.getByLabelText(/Nights/), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/Guests/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check availability' }));

    expect(router.push).toHaveBeenCalledWith('/properties/alpine-lake?checkIn=2099-07-10&checkOut=2099-07-14&nights=4&guestCount=5');
  });

  it('falls back to the search page if the property is unknown', () => {
    render(<StaySearchBar initial={{ ...INITIAL, propertySlug: '' }} variant="property" propertyName="" />);

    fireEvent.click(screen.getByRole('button', { name: 'Check availability' }));

    expect(router.push.mock.calls[0]?.[0]).toMatch(/^\/search\?/);
  });
});
