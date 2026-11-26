/**
 * @file apps/admin/src/features/property/components/house-rate-periods-dialog.tsx
 * @feature property
 * @dependencies use-house-rate-periods, bulk-rate-warning-dialog
 */

'use client';

import type { HouseSummary } from '@resort-booking/shared-types';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Snackbar,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { formatCents } from '@/shared/utils/money';
import { useHouseRatePeriods } from '../hooks/use-house-rate-periods';
import { BulkRateWarningDialog } from './bulk-rate-warning-dialog';
import { stickyFirstColumn } from '@/shared/utils/sticky-first-column';

interface HouseRatePeriodsDialogProps {
  open: boolean;
  house: HouseSummary | null;
  propertyId: string;
  allHouseIds: readonly string[];
  onClose: () => void;
}

/**
 * Seasonal rates for one house: peak season, holidays and so on. Past dates are allowed
 * because staff can correct history. Overlaps are refused by the API and shown here.
 */
export function HouseRatePeriodsDialog({
  open,
  house,
  propertyId,
  allHouseIds,
  onClose,
}: HouseRatePeriodsDialogProps): React.JSX.Element {
  const state = useHouseRatePeriods({ houseId: house?.id ?? null, propertyId, allHouseIds, open });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const currency = house?.currencyCode ?? 'EUR';
  const { draft } = state;
  const editing = draft.id !== null;
  const endBeforeStart = draft.startDate !== '' && draft.endDate !== '' && draft.endDate < draft.startDate;
  const formReady =
    draft.label.trim() !== '' && draft.startDate !== '' && draft.endDate !== '' && draft.euros.trim() !== '' && !endBeforeStart;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="rate-periods-title">
      <DialogTitle id="rate-periods-title">Seasonal rates{house === null ? '' : ` · ${house.name}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography color="text.secondary">
            {house === null ? '' : `Standard rate: ${formatCents(house.nightlyRateCents, currency)} per night. `}
            It applies to every night that is not inside a season below. Guests are charged night by night, so a booking that crosses into peak season pays each night at its own rate.
          </Typography>
          {state.error !== null ? <Alert severity="error">{state.error}</Alert> : null}
          {state.periods.length === 0 && !state.loading ? (
            <Typography>No seasonal rates yet. Every night uses the standard rate.</Typography>
          ) : (
            <TableContainer sx={stickyFirstColumn}>
<Table size="small" aria-label="Seasonal rates">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>First night</TableCell>
                  <TableCell>Last night</TableCell>
                  <TableCell>Per night</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {state.periods.map((period): React.JSX.Element => (
                  <TableRow key={period.id} hover>
                    <TableCell>{period.label}</TableCell>
                    <TableCell>{period.startDate}</TableCell>
                    <TableCell>{period.endDate}</TableCell>
                    <TableCell>{formatCents(period.nightlyRateCents, currency)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={(): void => state.startEdit(period)}>
                        Edit
                      </Button>
                      <Button size="small" color="error" onClick={(): void => setDeleteId(period.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
</TableContainer>
          )}
          <Typography variant="h6" component="h3">
            {editing ? 'Edit seasonal rate' : 'Add a seasonal rate'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              label="Name"
              placeholder="Peak summer"
              required
              fullWidth
              value={draft.label}
              onChange={(event): void => state.updateDraft({ label: event.target.value })}
            />
            <TextField
              label="First night"
              type="date"
              required
              fullWidth
              value={draft.startDate}
              onChange={(event): void => state.updateDraft({ startDate: event.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Last night"
              type="date"
              required
              fullWidth
              value={draft.endDate}
              error={endBeforeStart}
              helperText={endBeforeStart ? 'Cannot be before the first night' : undefined}
              onChange={(event): void => state.updateDraft({ endDate: event.target.value })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: draft.startDate } }}
            />
            <TextField
              label="Per night (€)"
              required
              fullWidth
              value={draft.euros}
              onChange={(event): void => state.updateDraft({ euros: event.target.value })}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Stack>
          {editing ? null : (
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.applyToAll}
                  onChange={(event): void => state.updateDraft({ applyToAll: event.target.checked })}
                />
              }
              label="Apply to all stays at this property"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {editing ? <Button onClick={state.resetDraft}>Cancel edit</Button> : null}
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!formReady || state.saving} onClick={(): void => void state.save()}>
          {state.saving ? 'Saving…' : editing ? 'Save changes' : draft.applyToAll ? 'Review…' : 'Add seasonal rate'}
        </Button>
      </DialogActions>
      {state.bulkWarning === null ? null : (
        <BulkRateWarningDialog
          preview={state.bulkWarning.preview}
          write={state.bulkWarning.write}
          currencyCode={currency}
          pending={state.saving}
          onCancel={state.cancelBulk}
          onConfirm={(): void => void state.confirmBulk()}
        />
      )}
      <Dialog open={deleteId !== null} onClose={(): void => setDeleteId(null)} aria-labelledby="delete-rate-title">
        <DialogTitle id="delete-rate-title">Remove this seasonal rate?</DialogTitle>
        <DialogContent>
          <Typography>
            Nights in this season go back to the standard rate. Bookings already made keep the price the guest was quoted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={(): void => setDeleteId(null)}>
            Keep it
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={(): void => {
              const id = deleteId;
              setDeleteId(null);
              if (id !== null) {
                void state.remove(id);
              }
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={state.notice !== null} autoHideDuration={4000} onClose={state.clearNotice} message={state.notice ?? ''} />
    </Dialog>
  );
}
