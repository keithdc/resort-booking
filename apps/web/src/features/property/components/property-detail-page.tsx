/**
 * @file apps/web/src/features/property/components/property-detail-page.tsx
 * @feature property
 * @dependencies gallery, map, houses
 */

import { Box, Container, Link as MuiLink, Stack, Typography } from '@mui/material';
import { BlurFade, Highlighter } from '@resort-booking/ui';
import { HouseListingCard } from '@/features/houses/components/house-listing-card';
import { PhotoGallery } from '@/shared/components/photo-gallery';
import { PropertyMap } from '@/shared/components/property-map';
import { formatAddress } from '@/shared/utils/format-address';
import { withDefaultStay, type StayQuery } from '@/shared/utils/stay-query';
import { fetchHouses, fetchProperty } from '../services/property-api';
import { StaySearchBar } from './stay-search-bar';

interface PropertyDetailPageProps {
  slug: string;
}

/**
 * Property listing: short header, photos, houses to book, map.
 */
export async function PropertyDetailPage({ slug }: PropertyDetailPageProps): Promise<React.JSX.Element> {
  const [property, houses] = await Promise.all([fetchProperty(slug), fetchHouses(slug)]);
  const stay: StayQuery = withDefaultStay({
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
        <StaySearchBar initial={stay} />
      </Container>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <PhotoGallery photos={property.photos} altFallback={property.name} />
      </Container>
      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <Typography variant="h4" component="h2" gutterBottom sx={{ mt: 2 }}>
          Choose a property
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Open a property to hold the dates and pay. The map below is this destination.
        </Typography>
        {houses.length === 0 ? (
          <Typography>No published properties here yet.</Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              mb: 6,
            }}
          >
            {houses.map((house, index) => (
              <BlurFade key={house.id} delay={index * 0.06}>
                <HouseListingCard house={house} quote={null} stay={stay} />
              </BlurFade>
            ))}
          </Box>
        )}
        <Typography variant="h5" component="h2" gutterBottom>
          Where you will stay
        </Typography>
        <Typography sx={{ mb: 1 }}>
          {formatAddress(property.addressLine, property.postalCode, property.city, property.countryCode)}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <MuiLink href={`tel:${property.phone}`}>{property.phone}</MuiLink>
          <MuiLink href={`mailto:${property.email}`}>{property.email}</MuiLink>
        </Stack>
        <PropertyMap latitude={property.latitude} longitude={property.longitude} label={property.name} />
      </Container>
    </Box>
  );
}
