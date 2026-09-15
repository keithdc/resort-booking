/**
 * @file apps/web/src/features/property/components/property-home-page.tsx
 * @feature property
 * @dependencies MUI, property-api
 */

import { Box, Card, CardActionArea, CardContent, CardMedia, Container, Typography } from '@mui/material';
import Link from 'next/link';
import { fetchProperties } from '../services/property-api';

/**
 * Guest landing: all published resorts.
 */
export async function PropertyHomePage(): Promise<React.JSX.Element> {
  const properties = await fetchProperties();

  return (
    <Container sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Stay with us
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 640 }}>
        Direct booking across our houses. Pick a resort, then a house — each listing has its own calendar.
      </Typography>
      {properties.length === 0 ? (
        <Typography>No published properties yet.</Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          {properties.map((property) => (
            <Card key={property.id}>
              <CardActionArea component={Link} href={`/properties/${property.slug}`}>
                {property.coverPhotoUrl !== null ? (
                  <CardMedia
                    component="img"
                    height="220"
                    image={property.coverPhotoUrl}
                    alt={property.name}
                  />
                ) : null}
                <CardContent>
                  <Typography variant="h5">{property.name}</Typography>
                  <Typography color="text.secondary">
                    {property.city}, {property.countryCode}
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
