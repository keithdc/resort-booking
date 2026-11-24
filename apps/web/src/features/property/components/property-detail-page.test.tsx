// @vitest-environment jsdom
/**
 * @file apps/web/src/features/property/components/property-detail-page.test.tsx
 * @feature property
 */

import type { CancellationPolicy, HouseSearchResult, HouseSummary, PropertyDetail } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeHouse, makeProperty, makeResult } from '../test-fixtures';
import { PropertyDetailPage } from './property-detail-page';

const api = vi.hoisted(() => ({
  fetchProperty: vi.fn<(slug: string) => Promise<PropertyDetail>>(),
  fetchHouses: vi.fn<(slug: string) => Promise<HouseSummary[]>>(),
  fetchCancellationPolicyOrNull: vi.fn<(slug: string) => Promise<CancellationPolicy | null>>(),
  fetchStaySearch: vi.fn<(checkIn: string, checkOut: string, guests: number, slug: string) => Promise<HouseSearchResult[]>>(),
}));

vi.mock('../services/property-api', () => ({
  fetchProperty: api.fetchProperty,
  fetchHouses: api.fetchHouses,
  fetchCancellationPolicyOrNull: api.fetchCancellationPolicyOrNull,
}));
vi.mock('@/features/houses/services/inventory-api', () => ({ fetchStaySearch: api.fetchStaySearch }));
vi.mock('next/navigation', () => ({ useRouter: (): { push: () => void } => ({ push: (): void => undefined }) }));
vi.mock('@/shared/components/property-map', () => ({ PropertyMap: (): null => null }));
vi.mock('@/shared/components/photo-gallery', () => ({ PhotoGallery: (): null => null }));
vi.mock('@/shared/components/stay-date-field', () => ({ StayDateField: (): null => null }));
vi.mock('@/shared/hooks/use-availability', () => ({
  usePropertyUnavailable: (): { unavailable: never[]; refresh: () => void } => ({ unavailable: [], refresh: (): void => undefined }),
}));

const LAKE = makeHouse('lake', 'Lake Chalet');
const SPRUCE = makeHouse('spruce', 'Spruce Studio');
const DUNE = makeHouse('dune', 'Dune House');
const POLICY: CancellationPolicy = {
  propertyId: 'p',
  tiers: [
    { minDaysBeforeCheckIn: 7, refundPercent: 100 },
    { minDaysBeforeCheckIn: 0, refundPercent: 0 },
  ],
  rebookable: false,
  rebookFeeType: 'none',
  rebookFeeValue: 0,
};
const DATES = { checkIn: '2099-07-10', checkOut: '2099-07-12', nights: '2', guestCount: '2' };


async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}): Promise<void> {
  render(await PropertyDetailPage({ slug: 'alpine-lake', searchParams }));
}

describe('PropertyDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchProperty.mockResolvedValue(makeProperty());
    api.fetchHouses.mockResolvedValue([LAKE, SPRUCE, DUNE]);
    api.fetchCancellationPolicyOrNull.mockResolvedValue(POLICY);
  });

  afterEach(cleanup);

  it('without dates it lists every stay at its standard rate and never calls the search', async () => {
    await renderPage();

    expect(api.fetchStaySearch).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Standard rate/)).toHaveLength(3);
    expect(screen.queryByText('Not available for these dates and guests')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Clear dates' })).toBeNull();
  });

  it('puts the contextual availability bar in the header', async () => {
    await renderPage();

    expect(screen.getByRole('form', { name: 'Check availability at Alpine Lake' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check availability' })).toBeTruthy();
  });

  it('with dates it asks the API for this property and splits free from taken', async () => {
    api.fetchStaySearch.mockResolvedValue([makeResult(SPRUCE, 30000)]);

    await renderPage(DATES);

    expect(api.fetchStaySearch).toHaveBeenCalledWith('2099-07-10', '2099-07-12', 2, 'alpine-lake');
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('data-availability') !== null);
    expect(links.map((link) => link.getAttribute('data-availability'))).toEqual(['available', 'unavailable', 'unavailable']);
    expect(links[0]?.textContent).toContain('Spruce Studio');
    expect(screen.getAllByText('Not available for these dates and guests')).toHaveLength(2);
    expect(screen.getByText(/for 2 nights/)).toBeTruthy();
  });

  it('sums the result up in a polite live region with a way back', async () => {
    api.fetchStaySearch.mockResolvedValue([makeResult(SPRUCE, 30000), makeResult(DUNE, 40000)]);

    await renderPage(DATES);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('2 of 3 stays available for 10 Jul to 12 Jul · 2 guests');
    expect(screen.getByRole('link', { name: 'Clear dates' }).getAttribute('href')).toBe('/properties/alpine-lake');
  });

  it('says what to do when nothing is free and keeps the muted stays visible', async () => {
    api.fetchStaySearch.mockResolvedValue([]);

    await renderPage(DATES);

    expect(screen.getByRole('status').textContent).toBe('No stays are free for those dates. Try other nights or fewer guests.');
    expect(screen.getAllByText('Not available for these dates and guests')).toHaveLength(3);
  });

  it('uses the singular when one of one stay is free', async () => {
    api.fetchHouses.mockResolvedValue([LAKE]);
    api.fetchStaySearch.mockResolvedValue([makeResult(LAKE, 20000)]);

    await renderPage({ ...DATES, guestCount: '1' });

    expect(screen.getByRole('status').textContent).toBe('1 of 1 stay available for 10 Jul to 12 Jul · 1 guest');
  });

  it('carries the searched dates onto each stay link', async () => {
    api.fetchStaySearch.mockResolvedValue([makeResult(LAKE, 20000)]);

    await renderPage(DATES);

    const href = screen.getAllByRole('link').find((link) => link.getAttribute('data-availability') === 'available')?.getAttribute('href');
    expect(href).toBe('/properties/alpine-lake/stays/lake?checkIn=2099-07-10&checkOut=2099-07-12&nights=2&guestCount=2');
  });

  it('falls back to the undated list with a calm message when the search fails', async () => {
    api.fetchStaySearch.mockRejectedValue(new Error('boom'));

    await renderPage(DATES);

    expect(screen.getByRole('status').textContent).toContain('We could not check availability just now');
    expect(screen.getAllByText(/Standard rate/)).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Clear dates' })).toBeTruthy();
  });

  it('falls back with a message for a past check-in, without calling the search', async () => {
    await renderPage({ checkIn: '2000-01-01' });

    expect(api.fetchStaySearch).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('already passed');
    expect(screen.getAllByText(/Standard rate/)).toHaveLength(3);
  });

  it('falls back with a message for an unreadable check-in', async () => {
    await renderPage({ checkIn: 'soon' });

    expect(api.fetchStaySearch).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('could not read those dates');
  });

  it('says so when the property has no stays', async () => {
    api.fetchHouses.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByText('No published stays here yet.')).toBeTruthy();
  });

  it('shows deadlines in the cancellation section for the searched check-in', async () => {
    api.fetchStaySearch.mockResolvedValue([makeResult(LAKE, 20000)]);

    await renderPage(DATES);

    expect(screen.getByText('Full refund until 3 Jul 2099')).toBeTruthy();
  });

  it('shows the generic cancellation steps without dates', async () => {
    await renderPage();

    expect(screen.getByText('Full refund until 7 days before check-in')).toBeTruthy();
  });

  it('orders the page: bar, stays, cancellation, location', async () => {
    await renderPage();

    const order = ['Check availability at Alpine Lake', 'Choose a stay', 'Cancellation and changes', 'Where you will stay'].map(
      (name) => screen.getByRole('heading', { name }),
    );
    for (let index = 1; index < order.length; index += 1) {
      const previous = order[index - 1];
      const current = order[index];
      expect(previous !== undefined && current !== undefined && Boolean(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    }
  });
});
