/**
 * @file apps/admin/src/features/property/components/property-extras-form.tsx
 * @feature extras
 * @dependencies staff-property-api
 */

'use client';

import type { ExtraService, ExtraServiceKind, ExtraServiceWrite } from '@resort-booking/shared-types';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
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
import { ApiRequestError } from '@/shared/services/api-client';
import { centsFromEuroInput, eurosInputFromCents, formatCents } from '@/shared/utils/money';
import {
  createPropertyExtra,
  deletePropertyExtra,
  updatePropertyExtra,
} from '../services/staff-property-api';

interface PropertyExtrasFormProps {
  propertyId: string;
  initial: ExtraService[];
}

interface Draft {
  name: string;
  description: string;
  kind: ExtraServiceKind;
  priceEuros: string;
  published: boolean;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  kind: 'instant',
  priceEuros: '0',
  published: true,
};

/**
 * Extra services for this property only (breakfast, transfer, …).
 */
export function PropertyExtrasForm({ propertyId, initial }: PropertyExtrasFormProps): React.JSX.Element {
  const [extras, setExtras] = useState<ExtraService[]>(initial);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const toWrite = (): ExtraServiceWrite => ({
    name: draft.name.trim(),
    description: draft.description.trim(),
    kind: draft.kind,
    priceCents: draft.kind === 'instant' ? centsFromEuroInput(draft.priceEuros) : 0,
    currencyCode: 'EUR',
    published: draft.published,
  });

  const onSave = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (editingId === null) {
        const created = await createPropertyExtra(propertyId, toWrite());
        setExtras((current): ExtraService[] => [...current, created].sort(byName));
      } else {
        const updated = await updatePropertyExtra(editingId, toWrite());
        setExtras((current): ExtraService[] =>
          current.map((row): ExtraService => (row.id === updated.id ? updated : row)),
        );
      }
      setOpen(false);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save extra');
    } finally {
      setPending(false);
    }
  };

  const onDelete = async (extraId: string): Promise<void> => {
    setPending(true);
    try {
      await deletePropertyExtra(extraId);
      setExtras((current): ExtraService[] => current.filter((row): boolean => row.id !== extraId));
      setConfirmId(null);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete extra');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h2">
        Priced extras
      </Typography>
      <Typography color="text.secondary">
        Breakfast or a transfer you sell at a set price. Or mark it as “ask us” so the guest can request
        it and you confirm later — the house is still booked.
      </Typography>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {extras.length === 0 ? <Typography>No extras on this property yet.</Typography> : null}
      {extras.length > 0 ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Published</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {extras.map((extra): React.JSX.Element => (
              <TableRow key={extra.id} hover>
                <TableCell>{extra.name}</TableCell>
                <TableCell>{extra.kind === 'instant' ? 'Priced' : 'Ask us first'}</TableCell>
                <TableCell>
                  {extra.kind === 'instant' ? formatCents(extra.priceCents, extra.currencyCode) : '—'}
                </TableCell>
                <TableCell>{extra.published ? 'Shown' : 'Hidden'}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    onClick={(): void => {
                      setEditingId(extra.id);
                      setDraft({
                        name: extra.name,
                        description: extra.description,
                        kind: extra.kind,
                        priceEuros: eurosInputFromCents(extra.priceCents),
                        published: extra.published,
                      });
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="small" color="error" onClick={(): void => setConfirmId(extra.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Button
        variant="contained"
        onClick={(): void => {
          setEditingId(null);
          setDraft(EMPTY_DRAFT);
          setOpen(true);
        }}
      >
        Add a priced extra
      </Button>
      <Dialog open={open} onClose={(): void => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId === null ? 'Add extra' : 'Edit extra'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={draft.name}
              onChange={(event): void => {
                setDraft((current): Draft => ({ ...current, name: event.target.value }));
              }}
            />
            <TextField
              label="Description"
              multiline
              minRows={2}
              value={draft.description}
              onChange={(event): void => {
                setDraft((current): Draft => ({ ...current, description: event.target.value }));
              }}
            />
            <FormControl>
              <InputLabel id="extra-kind">How guests get this</InputLabel>
              <Select
                labelId="extra-kind"
                label="How guests get this"
                value={draft.kind}
                onChange={(event): void => {
                  const value = event.target.value;
                  if (value !== 'instant' && value !== 'on_request') {
                    return;
                  }
                  setDraft((current): Draft => ({ ...current, kind: value }));
                }}
              >
                <MenuItem value="instant">Sell at a set price</MenuItem>
                <MenuItem value="on_request">Guests ask if we can provide this</MenuItem>
              </Select>
            </FormControl>
            {draft.kind === 'instant' ? (
              <TextField
                label="Price (€)"
                type="number"
                helperText="Shown at checkout once the stay is paid."
                value={draft.priceEuros}
                onChange={(event): void => {
                  setDraft((current): Draft => ({ ...current, priceEuros: event.target.value }));
                }}
              />
            ) : null}
            <FormControlLabel
              control={
                <Switch
                  checked={draft.published}
                  onChange={(event): void => {
                    setDraft((current): Draft => ({ ...current, published: event.target.checked }));
                  }}
                />
              }
              label="Show this to guests"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={pending} onClick={(): void => void onSave()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirmId !== null} onClose={(): void => setConfirmId(null)}>
        <DialogTitle>Delete this extra?</DialogTitle>
        <DialogActions>
          <Button onClick={(): void => setConfirmId(null)}>Keep</Button>
          <Button
            color="error"
            disabled={pending || confirmId === null}
            onClick={(): void => {
              if (confirmId !== null) {
                void onDelete(confirmId);
              }
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          Extras updated
        </Alert>
      </Snackbar>
    </Stack>
  );
}

function byName(left: ExtraService, right: ExtraService): number {
  return left.name.localeCompare(right.name);
}
