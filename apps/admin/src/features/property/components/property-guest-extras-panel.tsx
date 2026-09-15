/**
 * @file apps/admin/src/features/property/components/property-guest-extras-panel.tsx
 * @feature property
 * @dependencies extras, request options, listing save
 */

'use client';

import type { ExtraService, HouseRequestOption, PhotoWrite, PropertyDetail } from '@resort-booking/shared-types';
import { Alert, Card, CardContent, FormControlLabel, Snackbar, Stack, Switch, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { updateStaffProperty } from '../services/staff-property-api';
import { PropertyExtrasForm } from './property-extras-form';
import { PropertyRequestOptionsForm } from './property-request-options-form';

interface PropertyGuestExtrasPanelProps {
  property: PropertyDetail;
  extras: ExtraService[];
  requestOptions: HouseRequestOption[];
}

/**
 * Guest add-ons: free-text special requests, priced extras, ask-us items.
 */
export function PropertyGuestExtrasPanel({
  property,
  extras,
  requestOptions,
}: PropertyGuestExtrasPanelProps): React.JSX.Element {
  const router = useRouter();
  const [enabled, setEnabled] = useState(property.customRequestsEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onToggle = async (next: boolean): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await updateStaffProperty(property.id, {
        name: property.name,
        slug: property.slug,
        description: property.description,
        addressLine: property.addressLine,
        city: property.city,
        countryCode: property.countryCode,
        postalCode: property.postalCode,
        latitude: property.latitude,
        longitude: property.longitude,
        phone: property.phone,
        email: property.email,
        timezone: property.timezone,
        published: property.published,
        customRequestsEnabled: next,
        photos: property.photos.map((photo): PhotoWrite => ({
          url: photo.url,
          altText: photo.altText,
        })),
      });
      setEnabled(next);
      setSaved(true);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this setting');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={4}>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Special requests
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            When this is on, guests can write a message at checkout — for example if they need a cot
            you have not listed, or want to ask whether an extra is available for their dates.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                disabled={pending}
                onChange={(event): void => {
                  void onToggle(event.target.checked);
                }}
              />
            }
            label={enabled ? 'Guests can send a message' : 'Guests cannot send a message'}
          />
        </CardContent>
      </Card>
      <PropertyExtrasForm propertyId={property.id} initial={extras} />
      <PropertyRequestOptionsForm propertyId={property.id} initial={requestOptions} />
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          Special requests updated
        </Alert>
      </Snackbar>
    </Stack>
  );
}
