/**
 * @file apps/web/src/features/property/components/property-home-page.tsx
 * @feature property
 * @dependencies MUI, stay search, Magic UI
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { Box, CardActionArea, CardContent, CardMedia, Container, Typography } from '@mui/material';
import {
  AnimatedGradientBadge,
  AuroraText,
  BlurFade,
  DotPattern,
  LightRays,
  MagicCard,
  Marquee,
  SparklesText,
} from '@resort-booking/ui';
import Link from 'next/link';
import { formatAddress } from '@/shared/utils/format-address';
import { withDefaultStay } from '@/shared/utils/stay-query';
import { fetchProperties } from '../services/property-api';
import { StaySearchBar } from './stay-search-bar';

/**
 * Guest landing: dates first, then a resort.
 */
export async function PropertyHomePage(): Promise<React.JSX.Element> {
  const properties = await fetchProperties();
  const covers = properties.filter(
    (property: PropertySummary): property is PropertySummary & { coverPhotoUrl: string } =>
      property.coverPhotoUrl !== null,
  );

  return (
    <Box>
      <Box
        sx={{
          position: 'relative',
          overflow: 'visible',
          borderBottom: 1,
          borderColor: 'divider',
          pt: { xs: 6, md: 10 },
          pb: { xs: 6, md: 8 },
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <DotPattern />
          <LightRays />
        </Box>
        <Container sx={{ position: 'relative' }}>
          <BlurFade inView={false}>
            <AnimatedGradientBadge>Direct booking · one operator · not a marketplace</AnimatedGradientBadge>
            <Typography variant="h2" component="h1" sx={{ maxWidth: 760, mb: 2, mt: 1 }}>
              <SparklesText variant="inherit" component="span">
                Stay on the property.
              </SparklesText>{' '}
              <AuroraText variant="inherit">Pay once. Arrive.</AuroraText>
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 560, fontSize: { md: '1.15rem' } }}>
              Pick dates and guests. See which properties are free. Hold the stay and pay — card, Apple Pay,
              Google Pay, or bank transfer.
            </Typography>
          </BlurFade>
          <Box id="search" sx={{ scrollMarginTop: 96 }}>
            <StaySearchBar
              initial={withDefaultStay({
                checkIn: '',
                checkOut: '',
                nights: '1',
                guestCount: '2',
                propertySlug: '',
              })}
            />
          </Box>
        </Container>
      </Box>
      {covers.length > 0 ? (
        <Box sx={{ py: 3, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Marquee>
            {covers.map((property) => (
              <Box
                key={property.id}
                component={Link}
                href={`/properties/${property.slug}`}
                sx={{ display: 'block', width: 300, textDecoration: 'none' }}
              >
                <CardMedia
                  component="img"
                  height="180"
                  image={property.coverPhotoUrl}
                  alt={property.name}
                  sx={{ borderRadius: 1, objectFit: 'cover' }}
                />
              </Box>
            ))}
          </Marquee>
        </Box>
      ) : null}
      <Container id="places" sx={{ py: { xs: 6, md: 8 }, scrollMarginTop: 96 }}>
        <Typography variant="h4" component="h2" gutterBottom>
          Our properties
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 520 }}>
          One operator, several coasts and lakes. Each property has its own calendar.
        </Typography>
        {properties.length === 0 ? (
          <Typography>No published properties yet.</Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            }}
          >
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
                          alt={property.name}
                          sx={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <Box sx={{ height: 160, bgcolor: 'action.hover' }} />
                      )}
                    </Box>
                    <CardContent>
                      <Typography variant="h5">{property.name}</Typography>
                      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                        {formatAddress(
                          property.addressLine,
                          property.postalCode,
                          property.city,
                          property.countryCode,
                        )}
                      </Typography>
                      <Typography color="primary" sx={{ mt: 1.5, fontWeight: 600 }}>
                        See properties →
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </MagicCard>
              </BlurFade>
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}
