/**
 * @file apps/web/src/shared/components/site-footer.tsx
 * @shared Guest site footer
 * @dependencies property catalog, MUI
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { Box, Container, Divider, Link as MuiLink, Stack, Typography } from '@mui/material';
import NextLink from 'next/link';
import { fetchProperties } from '@/features/property/services/property-api';
import { formatAddress } from '@/shared/utils/format-address';
import { GuestAnchorLink } from './guest-anchor-link';

/**
 * Hospitality footer: destinations, search, and contact. No marketplace links.
 */
export async function SiteFooter(): Promise<React.JSX.Element> {
  const properties = await fetchProperties();
  const contact = properties[0] ?? null;

  return (
    <Box
      component="footer"
      id="contact"
      sx={{
        mt: 8,
        pt: { xs: 6, md: 8 },
        pb: 'calc(32px + env(safe-area-inset-bottom))',
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        scrollMarginTop: 96,
      }}
    >
      <Container>
        <Box
          sx={{
            display: 'grid',
            gap: 4,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1.2fr 1fr 1fr 1fr' },
            pb: 5,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: 0.4 }}>
              Humphreys
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, maxWidth: 280, opacity: 0.9 }}>
              Direct booking with the operator. One booking, one payment — card, Apple Pay, Google Pay, or bank
              transfer.
            </Typography>
          </Box>
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.8 }}>
              Stay
            </Typography>
            <Stack spacing={{ xs: 0, md: 1.25 }} sx={{ mt: 1.5 }}>
              <GuestAnchorLink hash="search" color="inherit">
                <SearchOutlinedIcon fontSize="small" />
                Search dates
              </GuestAnchorLink>
              <MuiLink
                component={NextLink}
                href="/properties"
                underline="hover"
                color="inherit"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: { xs: 44, md: 'auto' } }}
              >
                <PlaceOutlinedIcon fontSize="small" />
                Our properties
              </MuiLink>
            </Stack>
          </Box>
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.8 }}>
              Destinations
            </Typography>
            <Stack spacing={{ xs: 0, md: 1.25 }} sx={{ mt: 1.5 }}>
              {properties.length === 0 ? (
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Listings go live when a property is published.
                </Typography>
              ) : (
                properties.map((property: PropertySummary): React.JSX.Element => (
                  <MuiLink
                    key={property.id}
                    component={NextLink}
                    href={`/properties/${property.slug}`}
                    underline="hover"
                    color="inherit"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: { xs: 44, md: 'auto' } }}
                  >
                    <PlaceOutlinedIcon fontSize="small" />
                    {property.name}
                  </MuiLink>
                ))
              )}
            </Stack>
          </Box>
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.8 }}>
              Talk to us
            </Typography>
            {contact === null ? (
              <Typography variant="body2" sx={{ mt: 1.5, opacity: 0.8 }}>
                Phone and email appear on each property.
              </Typography>
            ) : (
              <Stack spacing={{ xs: 0, md: 1.25 }} sx={{ mt: 1.5 }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {formatAddress(contact.addressLine, contact.postalCode, contact.city, contact.countryCode)}
                </Typography>
                <MuiLink
                  href={`tel:${contact.phone}`}
                  underline="hover"
                  color="inherit"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: { xs: 44, md: 'auto' } }}
                >
                  <PhoneOutlinedIcon fontSize="small" />
                  {contact.phone}
                </MuiLink>
                <MuiLink
                  href={`mailto:${contact.email}`}
                  underline="hover"
                  color="inherit"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: { xs: 44, md: 'auto' } }}
                >
                  <EmailOutlinedIcon fontSize="small" />
                  {contact.email}
                </MuiLink>
              </Stack>
            )}
          </Box>
        </Box>
        <Divider sx={{ borderColor: 'currentColor', opacity: 0.24 }} />
        <Typography variant="caption" sx={{ display: 'block', mt: 3, opacity: 0.75 }}>
          © {new Date().getFullYear()} Humphreys Hospitality. Booked with us — not a marketplace.
        </Typography>
      </Container>
    </Box>
  );
}
