/**
 * @file apps/admin/src/features/property/components/property-houses-form.tsx
 * @feature property
 * @dependencies staff-property-api
 */

'use client';

import type { HouseAmenityWrite, HouseDetail, HouseSummary, HouseWrite, PhotoWrite } from '@resort-booking/shared-types';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { PhotoRankEditor } from './photo-rank-editor';
import { ApiRequestError } from '@/shared/services/api-client';
import { centsFromEuroInput, eurosInputFromCents, formatCents } from '@/shared/utils/money';
import { createStaffHouse, fetchStaffHouse, updateStaffHouse } from '../services/staff-property-api';

interface PropertyHousesFormProps {
  propertyId: string;
  initial: HouseSummary[];
}

interface HouseDraft {
  name: string;
  slug: string;
  description: string;
  capacity: string;
  nightlyEuros: string;
  published: boolean;
  amenities: HouseAmenityWrite[];
  photos: PhotoWrite[];
  slugTouched: boolean;
}

const EMPTY_DRAFT: HouseDraft = {
  name: '',
  slug: '',
  description: '',
  capacity: '4',
  nightlyEuros: '150',
  published: false,
  amenities: [{ name: 'Mattress', details: '' }, { name: 'Pillows', details: '' }],
  photos: [],
  slugTouched: false,
};

/**
 * Houses at this property: capacity, nightly rate, mattress/pillow facts.
 */
export function PropertyHousesForm({ propertyId, initial }: PropertyHousesFormProps): React.JSX.Element {
  const [houses, setHouses] = useState<HouseSummary[]>(initial);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HouseDraft>(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toWrite = (): HouseWrite => ({
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    description: draft.description.trim(),
    capacity: Number.parseInt(draft.capacity, 10) || 1,
    nightlyRateCents: centsFromEuroInput(draft.nightlyEuros),
    currencyCode: 'EUR',
    published: draft.published,
    amenities: draft.amenities
      .map((row): HouseAmenityWrite => ({ name: row.name.trim(), details: row.details.trim() }))
      .filter((row): boolean => row.name !== ''),
    photos: draft.photos
      .map((row): PhotoWrite => ({ url: row.url.trim(), altText: row.altText.trim() }))
      .filter((row): boolean => row.url !== ''),
  });

  const onSave = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const body = toWrite();
      const savedHouse =
        editingId === null
          ? await createStaffHouse(propertyId, body)
          : await updateStaffHouse(editingId, body);
      setHouses((current): HouseSummary[] => upsertHouse(current, savedHouse));
      setOpen(false);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save house');
    } finally {
      setPending(false);
    }
  };

  const openCreate = (): void => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setOpen(true);
  };

  const openEdit = async (houseId: string): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const house = await fetchStaffHouse(houseId);
      setEditingId(house.id);
      setDraft(draftFromHouse(house));
      setOpen(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load house');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Each house has its own calendar. What is already in the house (mattress, pillows) is listed here.
        Things guests can ask you to provide live under Guest extras.
      </Typography>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {houses.length === 0 ? <Typography>No houses yet. Add the first one to take bookings.</Typography> : null}
      {houses.length > 0 ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>House</TableCell>
              <TableCell>Capacity</TableCell>
              <TableCell>Nightly</TableCell>
              <TableCell>Published</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {houses.map((house): React.JSX.Element => (
              <TableRow key={house.id} hover>
                <TableCell>{house.name}</TableCell>
                <TableCell>{house.capacity}</TableCell>
                <TableCell>{formatCents(house.nightlyRateCents, house.currencyCode)}</TableCell>
                <TableCell>{house.published ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    onClick={(): void => {
                      void openEdit(house.id);
                    }}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Button variant="contained" onClick={openCreate}>
        Add a house
      </Button>
      <Dialog open={open} onClose={(): void => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingId === null ? 'Add a house' : 'Edit house'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              required
              value={draft.name}
              onChange={(event): void => {
                const name = event.target.value;
                setDraft((current): HouseDraft => ({
                  ...current,
                  name,
                  slug: current.slugTouched ? current.slug : slugify(name),
                }));
              }}
            />
            <TextField
              label="Description"
              required
              multiline
              minRows={3}
              helperText="At least 8 characters"
              value={draft.description}
              onChange={(event): void => {
                setDraft((current): HouseDraft => ({ ...current, description: event.target.value }));
              }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Capacity"
                type="number"
                required
                fullWidth
                value={draft.capacity}
                onChange={(event): void => {
                  setDraft((current): HouseDraft => ({ ...current, capacity: event.target.value }));
                }}
              />
              <TextField
                label="Price per night (€)"
                type="number"
                required
                fullWidth
                helperText="Guests see this as euros, not cents."
                value={draft.nightlyEuros}
                onChange={(event): void => {
                  setDraft((current): HouseDraft => ({
                    ...current,
                    nightlyEuros: event.target.value,
                  }));
                }}
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.published}
                  onChange={(event): void => {
                    setDraft((current): HouseDraft => ({ ...current, published: event.target.checked }));
                  }}
                />
              }
              label="Show this house on the website"
            />
            <Typography variant="subtitle2">Photos guests will see</Typography>
            <PhotoRankEditor
              photos={draft.photos}
              onChange={(photos): void => {
                setDraft((current): HouseDraft => ({ ...current, photos }));
              }}
            />
            <Typography variant="subtitle2">Already in the house</Typography>
            {draft.amenities.map((amenity, index): React.JSX.Element => (
              <Stack key={`amenity-${index}`} spacing={1}>
                <TextField
                  label="Item"
                  fullWidth
                  value={amenity.name}
                  onChange={(event): void => {
                    const name = event.target.value;
                    setDraft((current): HouseDraft => ({
                      ...current,
                      amenities: current.amenities.map((row, rowIndex): HouseAmenityWrite =>
                        rowIndex === index ? { ...row, name } : row,
                      ),
                    }));
                  }}
                />
                <TextField
                  label="Details"
                  fullWidth
                  multiline
                  minRows={3}
                  helperText="What guests should know about this item."
                  value={amenity.details}
                  onChange={(event): void => {
                    const details = event.target.value;
                    setDraft((current): HouseDraft => ({
                      ...current,
                      amenities: current.amenities.map((row, rowIndex): HouseAmenityWrite =>
                        rowIndex === index ? { ...row, details } : row,
                      ),
                    }));
                  }}
                />
                <Button
                  onClick={(): void => {
                    setDraft((current): HouseDraft => ({
                      ...current,
                      amenities: current.amenities.filter((_row, rowIndex): boolean => rowIndex !== index),
                    }));
                  }}
                >
                  Remove
                </Button>
              </Stack>
            ))}
            <Button
              variant="outlined"
              onClick={(): void => {
                setDraft((current): HouseDraft => ({
                  ...current,
                  amenities: [...current.amenities, { name: '', details: '' }],
                }));
              }}
            >
              Add amenity
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={pending} onClick={(): void => void onSave()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          House saved
        </Alert>
      </Snackbar>
    </Stack>
  );
}

function draftFromHouse(house: HouseDetail): HouseDraft {
  return {
    name: house.name,
    slug: house.slug,
    description: house.description,
    capacity: String(house.capacity),
    nightlyEuros: eurosInputFromCents(house.nightlyRateCents),
    published: house.published,
    amenities:
      house.amenities.length === 0
        ? [{ name: 'Mattress', details: '' }]
        : house.amenities.map((row): HouseAmenityWrite => ({ name: row.name, details: row.details })),
    photos: house.photos.map((photo): PhotoWrite => ({ url: photo.url, altText: photo.altText })),
    slugTouched: true,
  };
}

function upsertHouse(current: HouseSummary[], saved: HouseDetail): HouseSummary[] {
  const next = current.some((row): boolean => row.id === saved.id)
    ? current.map((row): HouseSummary => (row.id === saved.id ? saved : row))
    : [...current, saved];
  return next.sort((left, right): number => left.name.localeCompare(right.name));
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
