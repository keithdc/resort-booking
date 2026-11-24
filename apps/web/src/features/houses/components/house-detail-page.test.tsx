// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/house-detail-page.test.tsx
 * @feature houses
 */

import type { CancellationPolicy, ExtraService, HouseDetail, HouseRequestOption, PromotedOffer, PropertyDetail } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeOffer, makeProperty } from '@/features/property/test-fixtures';
import { HouseDetailPage } from './house-detail-page';

const api = vi.hoisted(() => ({
  fetchHouse: vi.fn<(slug: string, houseSlug: string) => Promise<HouseDetail>>(),
  fetchRequestOptions: vi.fn<(slug: string) => Promise<HouseRequestOption[]>>(),
  fetchExtras: vi.fn<(slug: string) => Promise<ExtraService[]>>(),
  fetchProperty: vi.fn<(slug: string) => Promise<PropertyDetail>>(),
  fetchCancellationPolicyOrNull: vi.fn<(slug: string) => Promise<CancellationPolicy | null>>(),
  fetchPropertyOffersOrEmpty: vi.fn<(slug: string) => Promise<PromotedOffer[]>>(),
}));
const checkout = vi.hoisted(() => ({ props: null as { offers: PromotedOffer[]; initialPromoCode: string } | null }));

vi.mock('@/features/property/services/property-api', () => ({
  fetchHouse: api.fetchHouse,
  fetchRequestOptions: api.fetchRequestOptions,
  fetchExtras: api.fetchExtras,
  fetchProperty: api.fetchProperty,
  fetchCancellationPolicyOrNull: api.fetchCancellationPolicyOrNull,
}));
vi.mock('@/features/property/services/offers-api', () => ({ fetchPropertyOffersOrEmpty: api.fetchPropertyOffersOrEmpty }));
vi.mock('./checkout-form', () => ({
  CheckoutForm: (props: { offers: PromotedOffer[]; initialPromoCode: string }): null => {
    checkout.props = props;
    return null;
  },
}));
vi.mock('@/shared/components/photo-gallery', () => ({ PhotoGallery: (): null => null }));
vi.mock('@/shared/components/property-map', () => ({ PropertyMap: (): null => null }));
vi.mock('./stay-cancellation-policy', () => ({ StayCancellationPolicy: (): null => null }));

const HOUSE: HouseDetail = {
  id: 'h1',
  organizationId: 'o',
  propertyId: 'p',
  propertySlug: 'alpine-lake',
  propertyName: 'Alpine Lake',
  propertyCity: 'Annecy',
  propertyCountryCode: 'FR',
  propertyTimezone: 'Europe/Paris',
  propertyAddressLine: '1 Rue',
  propertyPostalCode: '74000',
  slug: 'lake-chalet',
  name: 'Lake Chalet',
  description: '',
  capacity: 4,
  published: true,
  nightlyRateCents: 10000,
  currencyCode: 'EUR',
  coverPhotoUrl: null,
  mapLatitude: 45.9,
  mapLongitude: 6.1,
  latitude: null,
  longitude: null,
  photos: [],
  amenities: [],
  propertyPhone: '',
  propertyEmail: '',
  propertyLatitude: 0,
  propertyLongitude: 0,
};
const STAY = { checkIn: '', checkOut: '', nights: '1', guestCount: '2', propertySlug: 'alpine-lake' };

describe('HouseDetailPage offers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    checkout.props = null;
    api.fetchHouse.mockResolvedValue(HOUSE);
    api.fetchRequestOptions.mockResolvedValue([]);
    api.fetchExtras.mockResolvedValue([]);
    api.fetchProperty.mockResolvedValue(makeProperty());
    api.fetchCancellationPolicyOrNull.mockResolvedValue(null);
    api.fetchPropertyOffersOrEmpty.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('shows no offers UI when there are none', async () => {
    render(await HouseDetailPage({ propertySlug: 'alpine-lake', houseSlug: 'lake-chalet', stay: STAY }));

    expect(screen.queryByRole('region', { name: 'Current offers' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Current offers' })).toBeNull();
    expect(checkout.props?.offers).toEqual([]);
    expect(checkout.props?.initialPromoCode).toBe('');
  });

  it('shows the offers (with copy) above "About this stay" for the offers that apply to THIS stay', async () => {
    const mine = makeOffer({ id: 'mine', promoCode: 'WELCOME10', headline: 'Use code WELCOME10 for 10% off', houseIds: ['h1'] });
    const other = makeOffer({ id: 'other', headline: 'Only for another stay', houseIds: ['h9'] });
    api.fetchPropertyOffersOrEmpty.mockResolvedValue([other, mine]);
    api.fetchHouse.mockResolvedValue({ ...HOUSE, description: 'A cosy chalet by the lake.' });

    render(await HouseDetailPage({ propertySlug: 'alpine-lake', houseSlug: 'lake-chalet', stay: STAY }));

    const callout = screen.getByRole('region', { name: 'Offers for this stay' });
    expect(callout.textContent).toContain('Use code WELCOME10 for 10% off');
    expect(screen.queryByRole('region', { name: 'Current offers' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Current offers' })).toBeTruthy();
    const about = screen.getByRole('heading', { name: 'About this stay' });
    expect(callout.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Copy code WELCOME10' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Only for another stay')).toBeNull();
    expect(checkout.props?.offers.map((offer) => offer.id)).toEqual(['mine']);
  });

  it('hands the code from the link to checkout, to pre-fill only', async () => {
    render(await HouseDetailPage({ propertySlug: 'alpine-lake', houseSlug: 'lake-chalet', stay: STAY, promoCode: 'WELCOME10' }));

    expect(checkout.props?.initialPromoCode).toBe('WELCOME10');
  });
});
