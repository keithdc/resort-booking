/**
 * @file apps/admin/src/features/property/components/property-request-options-form.tsx
 * @feature property
 * @dependencies staff-property-api
 */

'use client';

import type { HouseRequestOption, HouseRequestOptionWrite } from '@resort-booking/shared-types';
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
import { ApiRequestError } from '@/shared/services/api-client';
import {
  createRequestOption,
  deleteRequestOption,
  updateRequestOption,
} from '../services/staff-property-api';

interface PropertyRequestOptionsFormProps {
  propertyId: string;
  initial: HouseRequestOption[];
}

interface Draft {
  name: string;
  description: string;
  published: boolean;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  published: true,
};

/**
 * Guest checkboxes at checkout: extra pillows, spare mattress, cot, …
 */
export function PropertyRequestOptionsForm({
  propertyId,
  initial,
}: PropertyRequestOptionsFormProps): React.JSX.Element {
  const [options, setOptions] = useState<HouseRequestOption[]>(initial);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const toWrite = (): HouseRequestOptionWrite => ({
    name: draft.name.trim(),
    description: draft.description.trim(),
    published: draft.published,
  });

  const onSave = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (editingId === null) {
        const created = await createRequestOption(propertyId, toWrite());
        setOptions((current): HouseRequestOption[] => [...current, created].sort(byName));
      } else {
        const updated = await updateRequestOption(editingId, toWrite());
        setOptions((current): HouseRequestOption[] =>
          current.map((row): HouseRequestOption => (row.id === updated.id ? updated : row)),
        );
      }
      setOpen(false);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save request option');
    } finally {
      setPending(false);
    }
  };

  const onDelete = async (optionId: string): Promise<void> => {
    setPending(true);
    try {
      await deleteRequestOption(optionId);
      setOptions((current): HouseRequestOption[] => current.filter((row): boolean => row.id !== optionId));
      setConfirmId(null);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete request option');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h2">
        Stay items guests can tick
      </Typography>
      <Typography color="text.secondary">
        Extra pillows, a spare mattress, a travel cot — guests tick these at checkout. They are not charged
        here. Turn an item off if you do not want it offered.
      </Typography>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {options.length === 0 ? <Typography>No request options yet.</Typography> : null}
      {options.length > 0 ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Published</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {options.map((option): React.JSX.Element => (
              <TableRow key={option.id} hover>
                <TableCell>
                  <Typography>{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.description}
                  </Typography>
                </TableCell>
                <TableCell>{option.published ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    onClick={(): void => {
                      setEditingId(option.id);
                      setDraft({
                        name: option.name,
                        description: option.description,
                        published: option.published,
                      });
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="small" color="error" onClick={(): void => setConfirmId(option.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Button
        variant="outlined"
        onClick={(): void => {
          setEditingId(null);
          setDraft(EMPTY_DRAFT);
          setOpen(true);
        }}
      >
        Add request option
      </Button>
      <Dialog open={open} onClose={(): void => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId === null ? 'Add request' : 'Edit request'}</DialogTitle>
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
            <FormControlLabel
              control={
                <Switch
                  checked={draft.published}
                  onChange={(event): void => {
                    setDraft((current): Draft => ({ ...current, published: event.target.checked }));
                  }}
                />
              }
              label="Shown at guest checkout"
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
        <DialogTitle>Delete this request option?</DialogTitle>
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
          Stay requests updated
        </Alert>
      </Snackbar>
    </Stack>
  );
}

function byName(left: HouseRequestOption, right: HouseRequestOption): number {
  return left.name.localeCompare(right.name);
}
