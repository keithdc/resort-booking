/**
 * @file apps/admin/src/features/property/components/property-discounts-panel.tsx
 * @feature property
 * @dependencies use-property-discounts, discount-dialog
 */

'use client';

import type { HouseSummary } from '@resort-booking/shared-types';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { usePropertyDiscounts } from '../hooks/use-property-discounts';
import { summarizeConditions, summarizeEffect, summarizeScope, summarizeUses } from '../utils/discount-draft';
import { AllHousesDiscountWarningDialog } from './all-houses-discount-warning-dialog';
import { DiscountDialog } from './discount-dialog';

interface PropertyDiscountsPanelProps {
  propertyId: string;
  houses: readonly HouseSummary[];
}

/**
 * Discounts for one property: long stay, early bird, promo codes and so on. Guests always get
 * the best single one unless discounts are marked as combinable.
 */
export function PropertyDiscountsPanel({ propertyId, houses }: PropertyDiscountsPanelProps): React.JSX.Element {
  const state = usePropertyDiscounts(propertyId);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const currencyCode = houses[0]?.currencyCode ?? 'EUR';

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Discounts come off the price of the nights. Guests get the single best discount that fits their stay; discounts
        marked &quot;can combine&quot; stack instead. Stays already booked keep the price the guest was quoted.
      </Typography>
      {state.error !== null && !state.formOpen ? (
        <Alert severity="error" onClose={state.clearError}>
          {state.error}
        </Alert>
      ) : null}
      {state.loading ? <Skeleton variant="rounded" height={96} /> : null}
      {!state.loading && state.discounts.length === 0 ? (
        <Typography>No discounts yet. Add one, for example 10% off stays of 7 nights or more.</Typography>
      ) : null}
      {state.discounts.length > 0 ? (
        <Table size="small" aria-label="Discounts">
          <TableHead>
            <TableRow>
              <TableCell>Discount</TableCell>
              <TableCell>Off</TableCell>
              <TableCell>When</TableCell>
              <TableCell>Applies to</TableCell>
              <TableCell>Stacking</TableCell>
              <TableCell>Uses</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {state.discounts.map((discount): React.JSX.Element => (
              <TableRow
                key={discount.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={(): void => state.openEdit(discount)}
              >
                <TableCell>
                  {discount.label}{' '}
                  <Chip size="small" color={discount.active ? 'success' : 'default'} label={discount.active ? 'On' : 'Off'} />
                </TableCell>
                <TableCell>{summarizeEffect(discount.effect, currencyCode)}</TableCell>
                <TableCell>{summarizeConditions(discount)}</TableCell>
                <TableCell>{summarizeScope(discount.houseIds, houses)}</TableCell>
                <TableCell>
                  {discount.combinable ? 'Can combine' : 'Best single'} · priority {discount.priority}
                </TableCell>
                <TableCell>{summarizeUses(discount.redemptions, discount.maxRedemptions)}</TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    onClick={(event): void => {
                      event.stopPropagation();
                      state.openEdit(discount);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={(event): void => {
                      event.stopPropagation();
                      setDeleteId(discount.id);
                    }}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Button variant="contained" onClick={state.openCreate}>
        Add a discount
      </Button>
      <DiscountDialog
        open={state.formOpen}
        editing={state.editingId !== null}
        draft={state.draft}
        houses={houses}
        currencyCode={currencyCode}
        error={state.error}
        saving={state.saving}
        onChange={state.updateDraft}
        onSave={(): void => void state.save()}
        onClose={state.closeForm}
      />
      {state.allHousesWarning ? (
        <AllHousesDiscountWarningDialog
          label={state.draft.label.trim()}
          effectText={
            state.draft.effectKind === 'percent' ? `${state.draft.value.trim()}%` : `${state.draft.value.trim()} ${currencyCode}`
          }
          pending={state.saving}
          onCancel={state.cancelAllHouses}
          onConfirm={(): void => void state.confirmAllHouses()}
        />
      ) : null}
      <Dialog open={deleteId !== null} onClose={(): void => setDeleteId(null)} aria-labelledby="delete-discount-title">
        <DialogTitle id="delete-discount-title">Remove this discount?</DialogTitle>
        <DialogContent>
          <Typography>
            Guests will stop getting it right away. Stays already booked keep the price the guest was quoted. To pause it
            instead, edit it and switch it off.
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
    </Stack>
  );
}
