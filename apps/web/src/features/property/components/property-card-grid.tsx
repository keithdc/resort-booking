/**
 * @file apps/web/src/features/property/components/property-card-grid.tsx
 * @feature property
 * @dependencies MUI, Magic UI
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { Box, CardActionArea, CardContent, CardMedia, Typography } from '@mui/material';
import { BlurFade, MagicCard } from '@resort-booking/ui';
import Link from 'next/link';
import { formatAddress } from '@/shared/utils/format-address';
import { photoSrcSet } from '@/shared/utils/responsive';

interface PropertyCardGridProps {
  properties: readonly PropertySummary[];
  /** The heading level of each card's name: h3 under a section heading, h2 straight under the page title. */
  headingLevel?: 'h2' | 'h3';
}

/**
 * Published properties as cards: photo, name, address, link to its stays. Shared by the home page
 * and the properties page so both always look the same.
 */
export function PropertyCardGrid({ properties, headingLevel = 'h3' }: PropertyCardGridProps): React.JSX.Element {
  if (properties.length === 0) {
    return <Typography>No published properties yet.</Typography>;
  }
  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      {properties.map((property, index) => (
        <BlurFade key={property.id} delay={index * 0.08}>
          <MagicCard>
            <CardActionArea component={Link} href={`/properties/${property.slug}`}>
              <Box sx={{ position: 'relative' }}>
                {property.coverPhotoUrl !== null ? (
                  <CardMedia
                    component="img"
                    height="280"
                    image={property.coverPhotoUrl}
                    srcSet={photoSrcSet(property.coverPhotoUrl)}
                    sizes="(max-width: 899px) 100vw, 600px"
                    loading="lazy"
                    decoding="async"
                    alt={property.name}
                    sx={{ objectFit: 'cover' }}
                  />
                ) : (
                  <Box sx={{ height: 160, bgcolor: 'action.hover' }} />
                )}
              </Box>
              <CardContent>
                <Typography variant="h5" component={headingLevel}>
                  {property.name}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {formatAddress(property.addressLine, property.postalCode, property.city, property.countryCode)}
                </Typography>
                <Typography color="primary" sx={{ mt: 1.5, fontWeight: 600 }}>
                  See stays →
                </Typography>
              </CardContent>
            </CardActionArea>
          </MagicCard>
        </BlurFade>
      ))}
    </Box>
  );
}
