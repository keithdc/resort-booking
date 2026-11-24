/**
 * @file apps/admin/src/features/property/components/property-workspace.tsx
 * @feature property
 * @dependencies listing, refunds, extras
 */

'use client';

import type {
  ExtraService,
  HouseRequestOption,
  HouseSummary,
  PropertyBookingConfig,
  PropertyDetail,
} from '@resort-booking/shared-types';
import { Box, Button, Chip, Stack, Tab, Tabs, Typography } from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';
import { PropertyGuestExtrasPanel } from './property-guest-extras-panel';
import { PropertyDiscountsPanel } from './property-discounts-panel';
import { PropertyHousesForm } from './property-houses-form';
import { PropertyListingForm } from './property-listing-form';
import { PropertyRefundsForm } from './property-refunds-form';

interface PropertyWorkspaceProps {
  property: PropertyDetail;
  houses: HouseSummary[];
  config: PropertyBookingConfig;
  extras: ExtraService[];
  requestOptions: HouseRequestOption[];
}

type WorkspaceTab = 'place' | 'houses' | 'extras' | 'cancel' | 'discounts';

/**
 * Per-property staff workspace in everyday language.
 */
export function PropertyWorkspace({
  property,
  houses,
  config,
  extras,
  requestOptions,
}: PropertyWorkspaceProps): React.JSX.Element {
  const [tab, setTab] = useState<WorkspaceTab>('place');

  return (
    <Box>
      <Button component={Link} href="/properties" size="small" sx={{ mb: 1 }}>
        All properties
      </Button>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h4" component="h1">
          {property.name}
        </Typography>
        <Chip size="small" label={property.published ? 'On the website' : 'Hidden from guests'} />
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Work through the tabs in order: pin the place, add houses, then extras, cancellation, and discounts.
      </Typography>
      <Tabs
        value={tab}
        onChange={(_event, value: WorkspaceTab): void => {
          setTab(value);
        }}
        variant="scrollable"
        sx={{ mb: 3 }}
      >
        <Tab value="place" label="1. Place & map" />
        <Tab value="houses" label="2. Houses" />
        <Tab value="extras" label="3. Guest extras" />
        <Tab value="cancel" label="4. If they cancel" />
        <Tab value="discounts" label="5. Discounts" />
      </Tabs>
      {tab === 'place' ? <PropertyListingForm property={property} /> : null}
      {tab === 'houses' ? <PropertyHousesForm propertyId={property.id} initial={houses} /> : null}
      {tab === 'extras' ? (
        <PropertyGuestExtrasPanel property={property} extras={extras} requestOptions={requestOptions} />
      ) : null}
      {tab === 'cancel' ? <PropertyRefundsForm propertyId={property.id} initial={config} /> : null}
      {tab === 'discounts' ? <PropertyDiscountsPanel propertyId={property.id} houses={houses} /> : null}
    </Box>
  );
}
