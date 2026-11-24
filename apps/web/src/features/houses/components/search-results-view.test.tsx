// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/search-results-view.test.tsx
 * @feature houses
 */

import type { HouseSearchResult, HouseSummary, Quote } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapPinView } from '../utils/map-pins';
import { SearchResultsView } from './search-results-view';

interface MapStubProps {
  pins: MapPinView[];
  activeHouseId: string | null;
  onHoverHouse: (houseId: string | null) => void;
}

// The real map needs WebGL, which jsdom does not have. The stub draws one chip per stay, the way
// the real map does, so hovering and the data it is given can be tested.
vi.mock('./search-results-map', () => ({
  SearchResultsMap: ({ pins, activeHouseId, onHoverHouse }: MapStubProps): React.JSX.Element => (
    <div aria-label="Map stub" data-active={activeHouseId ?? 'none'}>
      {pins.map((pin) => (
        <div key={pin.key} data-pin={pin.key}>
          {pin.stays.map((stay) => (
            <a
              key={stay.houseId}
              href={stay.href}
              aria-label={`chip ${stay.name} ${stay.priceLabel}`}
              onMouseEnter={(): void => onHoverHouse(stay.houseId)}
              onMouseLeave={(): void => onHoverHouse(null)}
            >
              {stay.name} {stay.priceLabel}
            </a>
          ))}
        </div>
      ))}
    </div>
  ),
}));

const STAY = { checkIn: '2027-07-10', checkOut: '2027-07-12', nights: '2', guestCount: '2', propertySlug: '' };

function result(id: string, name: string, totalCents: number, latitude: number, longitude: number): HouseSearchResult {
  const house: HouseSummary = {
    id,
    organizationId: 'o',
    propertyId: 'p',
    propertySlug: 'alpine-lake',
    propertyName: 'Alpine Lake',
    propertyCity: 'Annecy',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '1 Rue',
    propertyPostalCode: '74000',
    slug: id,
    name,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
    mapLatitude: latitude,
    mapLongitude: longitude,
  };
  const quote: Quote = {
    houseId: id,
    checkIn: '2027-07-10',
    checkOut: '2027-07-12',
    guestCount: 2,
    nights: 2,
    nightlyRateCents: 10000,
    lines: [],
    subtotalCents: totalCents,
    discounts: [],
    discountCents: 0,
    totalCents,
    currencyCode: 'EUR',
    available: true,
    promoCode: null,
  };
  return { house, quote };
}

const RESULTS = [
  result('lake', 'Lake Chalet', 64000, 45.899, 6.129),
  result('spruce', 'Spruce Studio', 28000, 45.899, 6.129),
  result('dune', 'Dune House', 48000, 43.4832, -1.5586),
];

function card(id: string): HTMLElement {
  const element = document.getElementById(`stay-${id}`);
  if (element === null) {
    throw new Error(`No card for ${id}`);
  }
  return element;
}

/** A chip on the map (the cards are links too, so look only inside the map). */
function chip(name: RegExp): HTMLElement {
  return within(screen.getByLabelText('Map stub')).getByRole('link', { name });
}

describe('SearchResultsView', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
  });

  afterEach(cleanup);

  it('lists every available stay', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    expect(card('lake').textContent).toContain('Lake Chalet');
    expect(card('spruce').textContent).toContain('Spruce Studio');
    expect(card('dune').textContent).toContain('Dune House');
  });

  it('puts EVERY stay on the map with its own price, not one price per place', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    const chips = screen.getByLabelText('Map stub').querySelectorAll('a');
    expect(chips).toHaveLength(3);
    const labels = [...chips].map((element) => (element.getAttribute('aria-label') ?? '').replace(/\s/g, ' '));
    expect(labels).toContain('chip Lake Chalet 640,00 €');
    expect(labels).toContain('chip Spruce Studio 280,00 €');
    expect(labels).toContain('chip Dune House 480,00 €');
  });

  it('keeps stays at the same place together on one pin, cheapest first', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    const pins = screen.getByLabelText('Map stub').querySelectorAll('[data-pin]');
    expect(pins).toHaveLength(2);
    const alpine = [...pins].find((pin) => pin.getAttribute('data-pin') === '45.89900,6.12900');
    expect([...(alpine?.querySelectorAll('a') ?? [])].map((a) => a.textContent?.split(' ')[0])).toEqual(['Spruce', 'Lake']);
  });

  it('links each chip to its stay with the guest\'s dates', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    expect(chip(/chip Lake Chalet/).getAttribute('href')).toBe(
      '/properties/alpine-lake/houses/lake?checkIn=2027-07-10&checkOut=2027-07-12&nights=2&guestCount=2',
    );
  });

  it('lights up that stay on the map when its card is hovered, and clears it on leave', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    fireEvent.mouseEnter(card('dune'));
    expect(screen.getByLabelText('Map stub').getAttribute('data-active')).toBe('dune');

    fireEvent.mouseLeave(card('dune'));
    expect(screen.getByLabelText('Map stub').getAttribute('data-active')).toBe('none');
  });

  it('lights up the card when its chip on the map is hovered', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    fireEvent.mouseEnter(chip(/chip Spruce Studio/));

    expect(card('spruce').getAttribute('data-active')).toBe('true');
    expect(card('lake').getAttribute('data-active')).toBe('false');
    fireEvent.mouseLeave(chip(/chip Spruce Studio/));
    expect(card('spruce').getAttribute('data-active')).toBe('false');
  });

  it('lights up the stay for keyboard users too', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    fireEvent.focus(card('lake'));

    expect(screen.getByLabelText('Map stub').getAttribute('data-active')).toBe('lake');
  });

  it('has no highlighted card until something is hovered', () => {
    render(<SearchResultsView results={RESULTS} stay={STAY} />);

    for (const id of ['lake', 'spruce', 'dune']) {
      expect(card(id).getAttribute('data-active')).toBe('false');
    }
  });

  it('offers a map/list toggle for phones that starts on the list', async () => {
    const { container } = render(<SearchResultsView results={RESULTS} stay={STAY} />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('data-mobile-view')).toBe('list');

    await userEvent.click(screen.getByRole('button', { name: 'Show map' }));
    expect(root?.getAttribute('data-mobile-view')).toBe('map');

    await userEvent.click(screen.getByRole('button', { name: 'Show list' }));
    expect(root?.getAttribute('data-mobile-view')).toBe('list');
  });

  it('shows just the list, with no map or toggle, when no stay has usable coordinates', () => {
    render(<SearchResultsView results={[result('lost', 'Lost Cabin', 10000, Number.NaN, Number.NaN)]} stay={STAY} />);

    expect(card('lost').textContent).toContain('Lost Cabin');
    expect(screen.queryByLabelText('Map stub')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show map' })).toBeNull();
  });

  it('keeps a stay without coordinates in the list while the others appear on the map', () => {
    render(<SearchResultsView results={[RESULTS[0] as HouseSearchResult, result('lost', 'Lost Cabin', 10000, Number.NaN, 0)]} stay={STAY} />);

    expect(card('lost')).toBeTruthy();
    expect(screen.getByLabelText('Map stub').querySelectorAll('a')).toHaveLength(1);
  });
});
