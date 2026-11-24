/**
 * @file apps/admin/src/features/property/components/property-listing-form.tsx
 * @feature property
 * @dependencies staff-property-api
 */

'use client';

import type { CreatePropertyRequest, GeocodeHit, PhotoWrite, PropertyDetail } from '@resort-booking/shared-types';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { EmailField, isValidEmail, isValidPhone, PhoneField } from '@resort-booking/ui/contact';
import { useRouter } from 'next/navigation';
import { useMemo, useEffect, useRef, useState } from 'react';
import { PropertyMap } from '@/shared/components/property-map';
import { ApiRequestError } from '@/shared/services/api-client';
import { createStaffProperty, reverseStaffGeocode, updateStaffProperty } from '../services/staff-property-api';
import { AddressAutocomplete } from './address-autocomplete';
import { PhotoRankEditor } from './photo-rank-editor';

interface PropertyListingFormProps {
  property: PropertyDetail | null;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  addressLine: string;
  city: string;
  countryCode: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  phone: string;
  email: string;
  timezone: string;
  published: boolean;
  slugTouched: boolean;
  photos: PhotoWrite[];
}

const FRANCE_CENTER = { latitude: 46.6, longitude: 2.2 };
const PIN_REVERSE_MS = 150;

/**
 * Place, map pin, and contact. Coordinates stay off-screen.
 */
export function PropertyListingForm({ property }: PropertyListingFormProps): React.JSX.Element {
  const router = useRouter();
  const isCreate = property === null;
  const [form, setForm] = useState<FormState>(() => initialState(property));
  const [pinReady, setPinReady] = useState(property !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const reverseTimerRef = useRef<number | null>(null);
  const reverseGenRef = useRef(0);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const pin = useMemo((): { latitude: number; longitude: number } => {
    const latitude = Number.parseFloat(form.latitude);
    const longitude = Number.parseFloat(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return FRANCE_CENTER;
    }
    return { latitude, longitude };
  }, [form.latitude, form.longitude]);

  const applyPlaceFromHit = (hit: GeocodeHit, snapPin: boolean): void => {
    setLookupHint(
      [
        hit.city !== '' ? hit.city : null,
        hit.postalCode !== '' ? hit.postalCode : null,
        hit.countryCode !== '' ? hit.countryCode : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' · ') || 'Pin moved. Edit town, postcode, or country if the lookup missed them.',
    );
    setForm((current): FormState => ({
      ...current,
      addressLine: hit.addressLine !== '' ? hit.addressLine : current.addressLine,
      city: hit.city !== '' ? hit.city : current.city,
      postalCode: hit.postalCode !== '' ? hit.postalCode : current.postalCode,
      countryCode: hit.countryCode !== '' ? hit.countryCode : current.countryCode,
      latitude: snapPin ? String(hit.latitude) : current.latitude,
      longitude: snapPin ? String(hit.longitude) : current.longitude,
    }));
  };

  const applyGeocodeHit = (hit: GeocodeHit): void => {
    if (reverseTimerRef.current !== null) {
      window.clearTimeout(reverseTimerRef.current);
      reverseTimerRef.current = null;
    }
    reverseGenRef.current += 1;
    setPinReady(true);
    applyPlaceFromHit(hit, true);
  };

  useEffect((): (() => void) => {
    return (): void => {
      if (reverseTimerRef.current !== null) {
        window.clearTimeout(reverseTimerRef.current);
      }
    };
  }, []);

  const body = (): CreatePropertyRequest => ({
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: form.description.trim(),
    addressLine: form.addressLine.trim(),
    city: form.city.trim(),
    countryCode: form.countryCode.trim().toUpperCase(),
    postalCode: form.postalCode.trim(),
    latitude: pin.latitude,
    longitude: pin.longitude,
    phone: form.phone.trim(),
    email: form.email.trim(),
    timezone: form.timezone.trim() === '' ? 'Europe/Paris' : form.timezone.trim(),
    published: isCreate ? false : form.published,
    customRequestsEnabled: isCreate ? true : property.customRequestsEnabled,
    photos: form.photos
      .map((row): PhotoWrite => ({ url: row.url.trim(), altText: row.altText.trim() }))
      .filter((row): boolean => row.url !== ''),
  });

  const onSubmit = async (): Promise<void> => {
    if (!pinReady) {
      setError('Search the street (or tap the map) so guests see the right pin.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const payload = body();
      if (isCreate) {
        const created = await createStaffProperty(payload);
        router.push(`/properties/${created.id}`);
        router.refresh();
        return;
      }
      await updateStaffProperty(property.id, payload);
      setSaved(true);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this place');
    } finally {
      setPending(false);
    }
  };

  return (
    <Box component="form" onSubmit={(event): void => event.preventDefault()}>
      <Stack spacing={3} maxWidth={760}>
        {error !== null ? <Alert severity="error">{error}</Alert> : null}
        {isCreate ? (
          <Alert severity="info">
            New places stay hidden from guests until you add stays and turn “Show on the website” on.
          </Alert>
        ) : null}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              About this place
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Name guests will see"
                required
                value={form.name}
                onChange={(event): void => {
                  const name = event.target.value;
                  setForm((current): FormState => ({
                    ...current,
                    name,
                    slug: current.slugTouched ? current.slug : slugify(name),
                  }));
                }}
              />
              <TextField
                label="Short description"
                required
                multiline
                minRows={3}
                helperText="A few sentences about the setting."
                value={form.description}
                onChange={(event): void => {
                  setForm((current): FormState => ({ ...current, description: event.target.value }));
                }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <PhoneField
                  label="Phone"
                  required
                  value={form.phone}
                  onChange={(phone): void => {
                    setForm((current): FormState => ({ ...current, phone }));
                  }}
                />
                <EmailField
                  label="Email"
                  required
                  value={form.email}
                  onChange={(email): void => {
                    setForm((current): FormState => ({ ...current, email }));
                  }}
                />
              </Stack>
              {!isCreate ? (
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.published}
                      onChange={(event): void => {
                        setForm((current): FormState => ({ ...current, published: event.target.checked }));
                      }}
                    />
                  }
                  label="Show this place on the website"
                />
              ) : null}
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Photos guests will see
            </Typography>
            <PhotoRankEditor
              photos={form.photos}
              onChange={(photos): void => {
                setForm((current): FormState => ({ ...current, photos }));
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Where it is
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Search the street and pick a result, or tap/drag the pin. Moving the pin fills street, town,
              postcode, and country from OpenStreetMap. You can still edit those fields if the lookup is a
              little off.
            </Typography>
            <Stack spacing={2}>
            <AddressAutocomplete
                value={form.addressLine}
                onInputChange={(next): void => {
                  setForm((current): FormState => ({ ...current, addressLine: next }));
                }}
                onSelect={(hit): void => {
                  applyGeocodeHit(hit);
                }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Town or city"
                  required
                  fullWidth
                  value={form.city}
                  onChange={(event): void => {
                    setForm((current): FormState => ({ ...current, city: event.target.value }));
                  }}
                />
                <TextField
                  label="Postcode"
                  required
                  fullWidth
                  value={form.postalCode}
                  onChange={(event): void => {
                    setForm((current): FormState => ({ ...current, postalCode: event.target.value }));
                  }}
                />
                <TextField
                  label="Country"
                  required
                  fullWidth
                  helperText="Two letters, e.g. FR"
                  value={form.countryCode}
                  onChange={(event): void => {
                    setForm((current): FormState => ({ ...current, countryCode: event.target.value }));
                  }}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {pinReady
                  ? 'Drag the pin or tap the map. The address fields update automatically.'
                  : 'Search above, or tap the map to place the pin.'}
              </Typography>
              {lookupHint !== null ? (
                <Typography variant="body2" color="text.secondary">
                  {lookupHint}
                </Typography>
              ) : null}
              <PropertyMap
                latitude={pin.latitude}
                longitude={pin.longitude}
                zoom={pinReady ? 15 : 5}
                label={form.name === '' ? 'New place' : form.name}
                onPinChange={(latitude, longitude): void => {
                  setPinReady(true);
                  setForm((current): FormState => ({
                    ...current,
                    latitude: String(latitude),
                    longitude: String(longitude),
                  }));
                  if (reverseTimerRef.current !== null) {
                    window.clearTimeout(reverseTimerRef.current);
                  }
                  const gen = reverseGenRef.current + 1;
                  reverseGenRef.current = gen;
                  reverseTimerRef.current = window.setTimeout((): void => {
                    void reverseStaffGeocode(latitude, longitude)
                      .then((hit): void => {
                        if (gen !== reverseGenRef.current) {
                          return;
                        }
                        if (hit === null) {
                          setLookupHint(
                            'Pin moved. Street lookup did not return a name — edit the fields if needed.',
                          );
                          return;
                        }
                        applyPlaceFromHit(hit, false);
                      })
                      .catch((): void => {
                        if (gen !== reverseGenRef.current) {
                          return;
                        }
                        setLookupHint('Pin moved. Street lookup failed — you can type the address.');
                      });
                  }, PIN_REVERSE_MS);
                }}
              />
            </Stack>
          </CardContent>
        </Card>
        <Button
          variant="contained"
          size="large"
          disabled={pending || !isValidPhone(form.phone) || !isValidEmail(form.email)}
          onClick={(): void => void onSubmit()}
        >
          {pending ? 'Saving…' : isCreate ? 'Create this place' : 'Save place'}
        </Button>
      </Stack>
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          Place saved
        </Alert>
      </Snackbar>
    </Box>
  );
}

function initialState(property: PropertyDetail | null): FormState {
  if (property === null) {
    return {
      name: '',
      slug: '',
      description: '',
      addressLine: '',
      city: '',
      countryCode: 'FR',
      postalCode: '',
      latitude: '',
      longitude: '',
      phone: '',
      email: '',
      timezone: 'Europe/Paris',
      published: false,
      slugTouched: false,
      photos: [],
    };
  }
  return {
    name: property.name,
    slug: property.slug,
    description: property.description,
    addressLine: property.addressLine,
    city: property.city,
    countryCode: property.countryCode,
    postalCode: property.postalCode,
    latitude: String(property.latitude),
    longitude: String(property.longitude),
    phone: property.phone,
    email: property.email,
    timezone: property.timezone,
    published: property.published,
    slugTouched: true,
    photos: property.photos.map((photo): PhotoWrite => ({ url: photo.url, altText: photo.altText })),
  };
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
