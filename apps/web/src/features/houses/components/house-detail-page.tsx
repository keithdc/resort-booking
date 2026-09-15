/**
 * @file apps/web/src/features/houses/components/house-detail-page.tsx
 * @feature houses
 * @dependencies property-api, checkout
 */

import { Box, Container, Link as MuiLink, Stack, Typography } from '@mui/material';
import NextLink from 'next/link';
import { fetchHouse } from '@/features/property/services/property-api';
import { PhotoGallery } from '@/shared/components/photo-gallery';
import { PropertyMap } from '@/shared/components/property-map';
import { CheckoutForm } from './checkout-form';

interface HouseDetailPageProps {
  propertySlug: string;
  houseSlug: string;
}

/**
 * House listing plus checkout that only talks to Nest.
 */
export async function HouseDetailPage({
  propertySlug,
  houseSlug,
}: HouseDetailPageProps): Promise<React.JSX.Element> {
  const house = await fetchHouse(propertySlug, houseSlug);
  const lat = house.latitude ?? house.propertyLatitude;
  const lng = house.longitude ?? house.propertyLongitude;

  return (
    <Container sx={{ py: 6 }}>
      <MuiLink component={NextLink} href={`/properties/${house.propertySlug}`}>
        {house.propertyName}
      </MuiLink>
      <Typography variant="h3" component="h1" gutterBottom sx={{ mt: 1 }}>
        {house.name}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
        {house.description}
      </Typography>
      <PhotoGallery photos={house.photos} altFallback={house.name} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ my: 3 }}>
        <MuiLink href={`tel:${house.propertyPhone}`}>{house.propertyPhone}</MuiLink>
        <MuiLink href={`mailto:${house.propertyEmail}`}>{house.propertyEmail}</MuiLink>
        <Typography color="text.secondary">
          {house.propertyAddressLine}, {house.propertyCity}
        </Typography>
        <Typography>Sleeps {house.capacity}</Typography>
      </Stack>
      <Box sx={{ mb: 4 }}>
        <PropertyMap latitude={lat} longitude={lng} label={house.name} />
      </Box>
      <CheckoutForm house={house} />
    </Container>
  );
}
