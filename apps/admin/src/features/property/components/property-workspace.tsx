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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BedOutlinedIcon from '@mui/icons-material/BedOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, Button, Chip, Paper, Tab, Tabs } from '@mui/material';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/shared/components/page-header';
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
      <Button component={Link} href="/properties" size="small" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        All properties
      </Button>
      <PageHeader
        icon={<HolidayVillageOutlinedIcon />}
        title={property.name}
        description="Work through the tabs in order: pin the place, add stays, then extras, cancellation, and discounts."
        badges={
          <Chip
            size="small"
            icon={property.published ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
            color={property.published ? 'success' : 'default'}
            label={property.published ? 'On the website' : 'Hidden from guests'}
          />
        }
      />
      <Paper elevation={1} sx={{ borderRadius: 2, mb: 3, px: 1 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: WorkspaceTab): void => {
            setTab(value);
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Property sections"
        >
          <Tab value="place" icon={<MapOutlinedIcon />} iconPosition="start" label="1. Place & map" />
          <Tab value="houses" icon={<BedOutlinedIcon />} iconPosition="start" label="2. Stays" />
          <Tab value="extras" icon={<ExtensionOutlinedIcon />} iconPosition="start" label="3. Guest extras" />
          <Tab value="cancel" icon={<GavelOutlinedIcon />} iconPosition="start" label="4. If they cancel" />
          <Tab value="discounts" icon={<LocalOfferOutlinedIcon />} iconPosition="start" label="5. Discounts" />
        </Tabs>
      </Paper>
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
