/**
 * @file apps/admin/src/features/property/components/staff-properties-page.tsx
 * @feature property
 * @dependencies staff-property-api
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import AddIcon from '@mui/icons-material/Add';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, Button, Card, CardActionArea, CardContent, CardMedia, Chip, Stack, Typography } from '@mui/material';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import Link from 'next/link';
import { fetchStaffProperties } from '../services/staff-property-api';

/**
 * Directory of places. Whole card opens that property.
 */
export async function StaffPropertiesPage(): Promise<React.JSX.Element> {
  const properties = await fetchStaffProperties();

  return (
    <>
      <PageHeader
        icon={<HolidayVillageOutlinedIcon />}
        tone="primary"
        title="Properties"
        description="Open a place to edit the map pin, stays, extras, and cancellations."
        actions={
          <Button component={Link} href="/properties/new" variant="contained" startIcon={<AddIcon />}>
            Add a property
          </Button>
        }
      />
      {properties.length === 0 ? (
        <EmptyState
          icon={<HolidayVillageOutlinedIcon />}
          title="No properties yet"
          hint="Add the first one to start taking bookings."
          action={
            <Button component={Link} href="/properties/new" variant="contained" startIcon={<AddIcon />}>
              Add a property
            </Button>
          }
        />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 3,
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
                      icon={property.published ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
                      label={property.published ? 'On the website' : 'Hidden'}
                      color={property.published ? 'success' : 'default'}
                    />
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
                    <PlaceOutlinedIcon fontSize="small" aria-hidden />
                    <Typography color="text.secondary">{property.city}</Typography>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
    </>
  );
}
