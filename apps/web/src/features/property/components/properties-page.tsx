/**
 * @file apps/web/src/features/property/components/properties-page.tsx
 * @feature property
 * @dependencies property-api, property-card-grid
 */

import { Container, Typography } from '@mui/material';
import { fetchProperties } from '../services/property-api';
import { PropertyCardGrid } from './property-card-grid';

/**
 * All published properties on their own page, so there is a real address to share or link to.
 */
export async function PropertiesPage(): Promise<React.JSX.Element> {
  const properties = await fetchProperties();
  return (
    <Container sx={{ py: { xs: 5, md: 8 } }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Our properties
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 560 }}>
        One operator, several coasts and lakes. Open a property to see its stays, photos and location.
      </Typography>
      <PropertyCardGrid properties={properties} />
    </Container>
  );
}
