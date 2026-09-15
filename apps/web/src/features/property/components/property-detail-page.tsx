/**
 * @file apps/web/src/features/property/components/property-detail-page.tsx
 * @feature property
 * @dependencies gallery, map, houses
 */

import { Box, Card, CardActionArea, CardContent, CardMedia, Container, Link as MuiLink, Stack, Typography } from '@mui/material';
import NextLink from 'next/link';
import { PhotoGallery } from '@/shared/components/photo-gallery';
import { PropertyMap } from '@/shared/components/property-map';
import { formatCents } from '@/shared/utils/money';
import { fetchHouses, fetchProperty } from '../services/property-api';

interface PropertyDetailPageProps {
  slug: string;
}

/**
 * Property listing: photos, contact, map, houses.
 */
export async function PropertyDetailPage({ slug }: PropertyDetailPageProps): Promise<React.JSX.Element> {
  const [property, houses] = await Promise.all([fetchProperty(slug), fetchHouses(slug)]);

  return (
    <Container sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        {property.name}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
        {property.description}
      </Typography>
      <PhotoGallery photos={property.photos} altFallback={property.name} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ my: 3 }}>
        <MuiLink href={`tel:${property.phone}`}>{property.phone}</MuiLink>
        <MuiLink href={`mailto:${property.email}`}>{property.email}</MuiLink>
        <Typography color="text.secondary">
          {property.addressLine}, {property.postalCode} {property.city}
        </Typography>
      </Stack>
      <Box sx={{ mb: 4 }}>
        <PropertyMap latitude={property.latitude} longitude={property.longitude} label={property.name} />
      </Box>
      <Typography variant="h4" component="h2" gutterBottom>
        Houses
      </Typography>
      {houses.length === 0 ? (
        <Typography>No published houses at this property yet.</Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          {houses.map((house) => (
            <Card key={house.id}>
              <CardActionArea component={NextLink} href={`/properties/${property.slug}/houses/${house.slug}`}>
                {house.coverPhotoUrl !== null ? (
                  <CardMedia component="img" height="200" image={house.coverPhotoUrl} alt={house.name} />
                ) : null}
                <CardContent>
                  <Typography variant="h6">{house.name}</Typography>
                  <Typography color="text.secondary">Up to {house.capacity} guests</Typography>
                  <Typography sx={{ mt: 1 }}>
                    From {formatCents(house.nightlyRateCents, house.currencyCode)} / night
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
    </Container>
  );
}
