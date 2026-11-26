/**
 * @file apps/web/src/features/property/components/property-detail-page.tsx
 * @feature property
 * @dependencies gallery, map, houses
 */

import { Box, Container, Link as MuiLink, Stack, Typography } from '@mui/material';
import { BlurFade, Highlighter } from '@resort-booking/ui';
import type { HouseSearchResult } from '@resort-booking/shared-types';
import { fetchStaySearch } from '@/features/houses/services/inventory-api';
import { CancellationPolicySection } from '@/shared/components/cancellation-policy';
import { PhotoGallery } from '@/shared/components/photo-gallery';
import { PropertyMap } from '@/shared/components/property-map';
import { formatAddress } from '@/shared/utils/format-address';
import { todayIsoDate } from '@/shared/utils/today-iso';
import { withDefaultStay, type StayQuery } from '@/shared/utils/stay-query';
import { fetchPropertyOffersOrEmpty } from '../services/offers-api';
import { fetchCancellationPolicyOrNull, fetchHouses, fetchProperty } from '../services/property-api';
import { parsePropertyStaySearch, type PropertyStaySearch, type RawSearchParams } from '../utils/property-stay-search';
import { PropertyStayList } from './property-stay-list';
import { StaySearchBar } from './stay-search-bar';

// Contact links are 44px tall on a phone and wrap long emails instead of overflowing.
const LINK_ROW_SX = { display: 'inline-flex', alignItems: 'center', minHeight: { xs: 44, md: 'auto' }, overflowWrap: 'anywhere' } as const;

interface PropertyDetailPageProps {
  slug: string;
  /** The page's query string: checkIn, checkOut, nights, guestCount. */
  searchParams?: RawSearchParams;
}

/**
 * Asks the API which stays are free. A failed search gives null so the page still renders.
 */
async function loadAvailability(slug: string, search: PropertyStaySearch): Promise<HouseSearchResult[] | null> {
  if (search.kind !== 'search') {
    return null;
  }
  try {
    return await fetchStaySearch(search.stay.checkIn, search.stay.checkOut, search.guests, slug);
  } catch {
    return null;
  }
}

/**
 * Property listing: header with the availability search, photos, stays (with availability for the
 * searched dates), cancellation terms, location and map.
 */
export async function PropertyDetailPage({
  slug,
  searchParams = {},
}: PropertyDetailPageProps): Promise<React.JSX.Element> {
  const search = parsePropertyStaySearch(searchParams, slug, todayIsoDate());
  const [property, houses, policy, results, offers] = await Promise.all([
    fetchProperty(slug),
    fetchHouses(slug),
    fetchCancellationPolicyOrNull(slug),
    loadAvailability(slug, search),
    fetchPropertyOffersOrEmpty(slug),
  ]);
  const stay: StayQuery =
    search.kind === 'search'
      ? search.stay
      : withDefaultStay({
          checkIn: '',
          checkOut: '',
          nights: '1',
          guestCount: '2',
          propertySlug: property.slug,
        });
  return (
    <Box>
      <Container sx={{ pt: { xs: 3, md: 5 }, pb: 2 }} maxWidth="lg">
        <BlurFade inView={false}>
          <Typography variant="h3" component="h1">
            {property.name}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2, lineHeight: 2 }}>
            Stay in{' '}
            <Highlighter action="underline" tone="secondary" isView={false}>
              {property.city}
            </Highlighter>
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
            {property.description}
          </Typography>
        </BlurFade>
        <StaySearchBar initial={stay} variant="property" propertyName={property.name} />
      </Container>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <PhotoGallery photos={property.photos} altFallback={property.name} />
      </Container>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <PropertyStayList
          propertySlug={property.slug}
          houses={houses}
          search={search}
          results={results}
          stay={stay}
          offers={offers}
        />
        <CancellationPolicySection
          policy={policy}
          currencyCode={houses[0]?.currencyCode ?? 'EUR'}
          checkIn={search.kind === 'search' ? search.stay.checkIn : undefined}
        />
        <Typography variant="h5" component="h2" gutterBottom>
          Where you will stay
        </Typography>
        <Typography sx={{ mb: 1 }}>
          {formatAddress(property.addressLine, property.postalCode, property.city, property.countryCode)}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 2 }} sx={{ mb: 2 }}>
          <MuiLink href={`tel:${property.phone}`} sx={LINK_ROW_SX}>{property.phone}</MuiLink>
          <MuiLink href={`mailto:${property.email}`} sx={LINK_ROW_SX}>{property.email}</MuiLink>
        </Stack>
        <PropertyMap latitude={property.latitude} longitude={property.longitude} label={property.name} />
      </Container>
    </Box>
  );
}
