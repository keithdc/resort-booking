/**
 * @file apps/admin/src/features/property/components/staff-properties-page.tsx
 * @feature property
 * @dependencies staff-property-api
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import { Box, Button, Card, CardActionArea, CardContent, CardMedia, Chip, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import { fetchStaffProperties } from '../services/staff-property-api';

/**
 * Directory of places. Whole card opens that property.
 */
export async function StaffPropertiesPage(): Promise<React.JSX.Element> {
  const properties = await fetchStaffProperties();

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <HolidayVillageOutlinedIcon color="primary" />
            <Typography variant="h4" component="h1">
              Properties
            </Typography>
          </Stack>
          <Typography color="text.secondary">
            Open a place to edit the map pin, stays, extras, and cancellations.
          </Typography>
        </Box>
        <Button component={Link} href="/properties/new" variant="contained">
          Add a property
        </Button>
      </Stack>
      {properties.length === 0 ? (
        <Typography>No properties yet. Add the first one to start taking bookings.</Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          {properties.map((property: PropertySummary): React.JSX.Element => (
            <Card key={property.id}>
              <CardActionArea component={Link} href={`/properties/${property.id}`}>
                {property.coverPhotoUrl !== null ? (
                  <CardMedia component="img" height="160" image={property.coverPhotoUrl} alt="" />
                ) : null}
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="h6">{property.name}</Typography>
                    <Chip
                      size="small"
                      label={property.published ? 'On the website' : 'Hidden'}
                      color={property.published ? 'primary' : 'default'}
                    />
                  </Stack>
                  <Typography color="text.secondary">{property.city}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
    </>
  );
}
