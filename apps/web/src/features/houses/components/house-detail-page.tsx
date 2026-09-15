/**
 * @file apps/web/src/features/houses/components/house-detail-page.tsx
 * @feature houses
 * @dependencies property-api, checkout
 */

import { Box, Container, Link as MuiLink, Stack, Typography } from '@mui/material';
import NextLink from 'next/link';
import { fetchExtras, fetchHouse, fetchProperty, fetchRequestOptions } from '@/features/property/services/property-api';
import { PhotoGallery } from '@/shared/components/photo-gallery';
import { PropertyMap } from '@/shared/components/property-map';
import { formatAddress } from '@/shared/utils/format-address';
import { formatCents } from '@/shared/utils/money';
import type { StayQuery } from '@/shared/utils/stay-query';
import { CheckoutForm } from './checkout-form';
import { ListingHighlights } from './listing-highlights';

interface HouseDetailPageProps {
  propertySlug: string;
  houseSlug: string;
  stay: StayQuery;
}

/**
 * House listing: short header, gallery, then book panel + map.
 */
export async function HouseDetailPage({
  propertySlug,
  houseSlug,
  stay,
}: HouseDetailPageProps): Promise<React.JSX.Element> {
  const [house, requestOptions, extras, property] = await Promise.all([
    fetchHouse(propertySlug, houseSlug),
    fetchRequestOptions(propertySlug),
    fetchExtras(propertySlug),
    fetchProperty(propertySlug),
  ]);
  const lat = house.latitude ?? house.propertyLatitude;
  const lng = house.longitude ?? house.propertyLongitude;

  return (
    <Container sx={{ py: 6 }} maxWidth="lg">
      <MuiLink component={NextLink} href={`/properties/${house.propertySlug}`}>
        {house.propertyName}
      </MuiLink>
      <Typography variant="h3" component="h1" sx={{ mt: 1 }}>
        {house.name}
      </Typography>
      <ListingHighlights
        city={house.propertyCity}
        sleeps={house.capacity}
        rateLabel={formatCents(house.nightlyRateCents, house.currencyCode)}
      />
      <Box sx={{ mb: 4 }}>
        <PhotoGallery photos={house.photos} altFallback={house.name} />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 4,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.3fr) minmax(280px, 0.7fr)' },
          alignItems: 'start',
        }}
      >
        <Box>
          {house.description.trim() !== '' ? (
            <>
              <Typography variant="h6" component="h2" gutterBottom>
                About this property
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
                {house.description}
              </Typography>
            </>
          ) : null}
          {property.description.trim() !== '' && property.description !== house.description ? (
            <>
              <Typography variant="h6" component="h2" gutterBottom>
                About the destination
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
                {property.description}
              </Typography>
            </>
          ) : null}
          {house.amenities.length > 0 ? (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" component="h2" gutterBottom>
                Included
              </Typography>
              <Stack spacing={1}>
                {house.amenities.map((amenity): React.JSX.Element => (
                  <Box key={amenity.id}>
                    <Typography>{amenity.name}</Typography>
                    {amenity.details !== '' ? (
                      <Typography variant="body2" color="text.secondary">
                        {amenity.details}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : null}
          <Typography variant="h6" component="h2" gutterBottom>
            Location and contact
          </Typography>
          <Typography sx={{ mb: 1 }}>
            {formatAddress(
              house.propertyAddressLine,
              house.propertyPostalCode,
              house.propertyCity,
              house.propertyCountryCode,
            )}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <MuiLink href={`tel:${house.propertyPhone}`}>{house.propertyPhone}</MuiLink>
            <MuiLink href={`mailto:${house.propertyEmail}`}>{house.propertyEmail}</MuiLink>
          </Stack>
          <PropertyMap latitude={lat} longitude={lng} label={house.name} />
        </Box>
        <Box sx={{ position: { md: 'sticky' }, top: 96 }}>
          <CheckoutForm
            house={house}
            initialStay={stay}
            requestOptions={requestOptions}
            extras={extras}
            customRequestsEnabled={property.customRequestsEnabled}
          />
        </Box>
      </Box>
    </Container>
  );
}
