// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/house-listing-card.test.tsx
 * @feature houses
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeHouse, makeOffer, makeQuote } from '@/features/property/test-fixtures';
import { HouseListingCard } from './house-listing-card';

const HOUSE = makeHouse('lake', 'Lake Chalet');
const STAY = { checkIn: '2099-07-10', checkOut: '2099-07-12', nights: '2', guestCount: '2', propertySlug: 'alpine-lake' };

function link(): HTMLElement {
  return screen.getByRole('link');
}

describe('HouseListingCard availability', () => {
  afterEach(cleanup);

  it('looks like today when nothing was searched', () => {
    render(<HouseListingCard house={HOUSE} quote={null} stay={null} />);

    expect(screen.getByText(/Standard rate/)).toBeTruthy();
    expect(screen.getByText('Book this stay →')).toBeTruthy();
    expect(screen.queryByText('Not available for these dates and guests')).toBeNull();
    expect(link().getAttribute('data-availability')).toBe('unknown');
    expect(link().getAttribute('aria-disabled')).toBeNull();
  });

  it('shows the API quote for an available stay', () => {
    render(<HouseListingCard house={HOUSE} quote={makeQuote('lake', 64000)} stay={STAY} availability="available" />);

    expect(screen.getByText(/for 2 nights/)).toBeTruthy();
    expect(screen.queryByText(/Standard rate/)).toBeNull();
    expect(screen.getByText('Book this stay →')).toBeTruthy();
    expect(link().getAttribute('data-availability')).toBe('available');
  });

  it('mutes an unavailable stay, labels it, and keeps it a link to the stay', () => {
    render(<HouseListingCard house={HOUSE} quote={null} stay={STAY} availability="unavailable" />);

    expect(screen.getByText('Not available for these dates and guests')).toBeTruthy();
    expect(screen.getByText('View this stay →')).toBeTruthy();
    expect(screen.queryByText('Book this stay →')).toBeNull();
    expect(link().getAttribute('aria-disabled')).toBe('true');
    expect(link().getAttribute('data-availability')).toBe('unavailable');
    expect(link().getAttribute('href')).toMatch(/^\/properties\/alpine-lake\/stays\/lake\?/);
  });

  it('never shows a price for an unavailable stay even if a quote is passed', () => {
    render(<HouseListingCard house={HOUSE} quote={makeQuote('lake', 64000)} stay={STAY} availability="unavailable" />);

    expect(screen.queryByText(/for 2 nights/)).toBeNull();
  });
});

describe('HouseListingCard offers', () => {
  afterEach(cleanup);

  it('shows the headline of each offer as text, with no button inside the link', () => {
    const code = makeOffer({ id: 'c', promoCode: 'WELCOME10', headline: 'Use code WELCOME10 for 10% off' });
    render(<HouseListingCard house={HOUSE} quote={null} stay={null} offers={[makeOffer(), code]} />);

    expect(screen.getByText('Save 10% when you stay 7 or more nights')).toBeTruthy();
    expect(screen.getByText('Use code WELCOME10 for 10% off')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no offers by default, and none on a muted unavailable stay', () => {
    const { rerender } = render(<HouseListingCard house={HOUSE} quote={null} stay={null} />);
    expect(screen.queryByRole('list', { name: 'Current offers' })).toBeNull();

    rerender(<HouseListingCard house={HOUSE} quote={null} stay={STAY} availability="unavailable" offers={[makeOffer()]} />);
    expect(screen.queryByText('Save 10% when you stay 7 or more nights')).toBeNull();
  });
});
