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
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { useState } from 'react';
import { localTodayIso } from '@/shared/utils/month-bounds';
import { usePropertyDiscounts } from '../hooks/use-property-discounts';
import {
  discountStatus,
  summarizeConditions,   summarizeEffect,
  summarizeScope,
  summarizeStacking,
  summarizeUses,
  type DiscountStatusKind,
} from '../utils/discount-draft';
import { AllHousesDiscountWarningDialog } from './all-houses-discount-warning-dialog';
import { DiscountDialog } from './discount-dialog';

interface PropertyDiscountsPanelProps {
  propertyId: string;
  houses: readonly HouseSummary[];
  /** Today's local date (YYYY-MM-DD). Defaults to the browser's today; tests pass a fixed day. */
  today?: string;
}

const STATUS_ICON: Record<DiscountStatusKind, React.ReactElement> = {
  off: <PowerSettingsNewIcon />,
  used_up: <BlockOutlinedIcon />,
  ended: <EventBusyOutlinedIcon />,
  starts: <ScheduleOutlinedIcon />,
  live: <CheckCircleOutlineIcon />,
};

const STATUS_COLOR: Record<DiscountStatusKind, 'default' | 'success' | 'warning' | 'info'> = {
  off: 'default',
  used_up: 'warning',
  ended: 'default',
  starts: 'info',
  live: 'success',
};

/**
 * Discounts for one property: long stay, early bird, promo codes and so on. Automatic discounts never stack
 * (the guest gets the best one); a promo code stacks after it.
 */
export function PropertyDiscountsPanel({ propertyId, houses, today }: PropertyDiscountsPanelProps): React.JSX.Element {
  const [clockToday] = useState<string>(() => localTodayIso());
  const todayIso = today ?? clockToday;
  const state = usePropertyDiscounts(propertyId);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const currencyCode = houses[0]?.currencyCode ?? 'EUR';

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Discounts come off the price of the nights. Automatic discounts do not stack: the guest gets the best one that fits.
        A promo code is a coupon and stacks after it. Set a limit and a discount stops being offered once it is used up.
        Bookings already made keep the price the guest was quoted.
      </Typography>
      {state.error !== null && !state.formOpen ? (
        <Alert severity="error" onClose={state.clearError}>
          {state.error}
        </Alert>
      ) : null}
      {state.loading ? <Skeleton variant="rounded" height={96} /> : null}
      {!state.loading && state.discounts.length === 0 ? (
        <Typography>No discounts yet. Add one, for example 10% off bookings of 7 nights or more.</Typography>
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
                  <StatusChip discount={discount} today={todayIso} />
                  {discount.promoted ? (
                    <>
                      {' '}
                      <Chip size="small" variant="outlined" color="primary" label="Promoted" />
                    </>
                  ) : null}
                </TableCell>
                <TableCell>{summarizeEffect(discount.effect, currencyCode)}</TableCell>
                <TableCell>{summarizeConditions(discount)}</TableCell>
                <TableCell>{summarizeScope(discount.houseIds, houses)}</TableCell>
                <TableCell>
                  {summarizeStacking(discount)}
                </TableCell>
                <TableCell>
                  {summarizeUses(discount.redemptions, discount.maxRedemptions)}
                </TableCell>
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
        today={todayIso}
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
            Guests will stop getting it right away. Bookings already made keep the price the guest was quoted. To pause it
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

interface StatusChipProps {
  discount: Parameters<typeof discountStatus>[0];
  today: string;
}

/**
 * One status per discount: Live, Starts 1 Dec, Ended, Used up or Off. An icon and the word say it, not colour alone.
 */
function StatusChip({ discount, today }: StatusChipProps): React.JSX.Element {
  const status = discountStatus(discount, today);
  return (
    <Chip size="small" icon={STATUS_ICON[status.kind]} color={STATUS_COLOR[status.kind]} label={status.label} data-status={status.kind} />
  );
}
