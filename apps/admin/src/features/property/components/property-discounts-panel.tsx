/**
 * @file apps/admin/src/features/property/components/property-discounts-panel.tsx
 * @feature property
 * @dependencies use-property-discounts, discount-dialog
 */

'use client';

import type { HouseSummary } from '@resort-booking/shared-types';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useState } from 'react';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
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
import {
  DEFAULT_DISCOUNT_FILTERS,
  DISCOUNT_PAGE_SIZE,
  filterDiscounts,
  guestLimitLabel,
  hasActiveFilters,
  NO_DISCOUNT_FILTERS,
  PROMOTED_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  TYPE_FILTER_OPTIONS,
  type DiscountFilters,
  type DiscountPromotedFilter,
  type DiscountStatusFilter,
  type DiscountTypeFilter,
} from '../utils/discount-filter';
import { AllHousesDiscountWarningDialog } from './all-houses-discount-warning-dialog';
import { DiscountDialog } from './discount-dialog';

interface PropertyDiscountsPanelProps {
  propertyId: string;
  houses: readonly HouseSummary[];
  /** Today's local date (YYYY-MM-DD). Defaults to the browser's today; tests pass a fixed day. */
  today?: string;
  /** The filters the list opens with. Defaults to Live only; tests pass everything. */
  initialFilters?: DiscountFilters;
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
export function PropertyDiscountsPanel({ propertyId, houses, today, initialFilters = DEFAULT_DISCOUNT_FILTERS }: PropertyDiscountsPanelProps): React.JSX.Element {
  const [clockToday] = useState<string>(() => localTodayIso());
  const todayIso = today ?? clockToday;
  const state = usePropertyDiscounts(propertyId);
  const compact = useCompactLayout();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // The filters are local to this screen (like the audit log): nothing is saved or put in the address.
  const [filters, setFilters] = useState<DiscountFilters>(initialFilters);
  const [shown, setShown] = useState(DISCOUNT_PAGE_SIZE);
  const currencyCode = houses[0]?.currencyCode ?? 'EUR';
  const matching = filterDiscounts(state.discounts, filters, todayIso);
  const visible = matching.slice(0, shown);
  const filtered = hasActiveFilters(filters);
  const changeFilters = (patch: Partial<DiscountFilters>): void => {
    setFilters((current): DiscountFilters => ({ ...current, ...patch }));
    setShown(DISCOUNT_PAGE_SIZE);
  };
  const clearFilters = (): void => {
    setFilters(NO_DISCOUNT_FILTERS);
    setShown(DISCOUNT_PAGE_SIZE);
  };

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
        <Stack spacing={1} component="section" aria-label="Filter discounts">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              size="small"
              fullWidth
              label="Search by name or code"
              value={filters.search}
              onChange={(event): void => changeFilters({ search: event.target.value })}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" aria-hidden />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              select
              size="small"
              label="Type"
              value={filters.type}
              onChange={(event): void => changeFilters({ type: event.target.value as DiscountTypeFilter })}
              sx={{ minWidth: { sm: 210 } }}
            >
              {TYPE_FILTER_OPTIONS.map((option): React.JSX.Element => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Status"
              value={filters.status}
              onChange={(event): void => changeFilters({ status: event.target.value as DiscountStatusFilter })}
              sx={{ minWidth: { sm: 170 } }}
            >
              {STATUS_FILTER_OPTIONS.map((option): React.JSX.Element => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Promoted"
              value={filters.promoted}
              onChange={(event): void => changeFilters({ promoted: event.target.value as DiscountPromotedFilter })}
              sx={{ minWidth: { sm: 210 } }}
            >
              {PROMOTED_FILTER_OPTIONS.map((option): React.JSX.Element => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary" role="status">
              Showing {String(visible.length)} of {String(matching.length)}
              {filtered ? ` matching, ${String(state.discounts.length)} in all` : ''}
            </Typography>
            {filtered ? (
              <Button size="small" startIcon={<FilterAltOffOutlinedIcon fontSize="small" />} onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </Stack>
        </Stack>
      ) : null}
      {state.discounts.length > 0 && matching.length === 0 ? (
        <Typography>{filters.status === 'live' ? 'No discounts match these filters (only live ones are shown). Clear the filters to see them all.' : 'No discounts match these filters'}</Typography>
      ) : null}
      {matching.length > 0 && compact ? (
        <Box component="ul" aria-label="Discounts" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {visible.map((discount): React.JSX.Element => (
            <Box component="li" key={discount.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
              <Typography sx={{ fontWeight: 600 }}>{discount.label}</Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.75 }}>
                <StatusChip discount={discount} today={todayIso} />
                {discount.promoted ? <Chip size="small" variant="outlined" color="primary" label="Promoted" /> : null}
                {guestLimitLabel(discount) === null ? null : <Chip size="small" variant="outlined" label={guestLimitLabel(discount)} />}
              </Stack>
              <Typography sx={{ mt: 1, fontWeight: 600 }}>{summarizeEffect(discount.effect, currencyCode)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {summarizeConditions(discount)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Applies to: {summarizeScope(discount.houseIds, houses)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {summarizeStacking(discount)} · Uses: {summarizeUses(discount.redemptions, discount.maxRedemptions)}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, '& > button': { flex: 1 } }}>
                <Button variant="outlined" size="small" onClick={(): void => state.openEdit(discount)}>
                  Edit
                </Button>
                <Button variant="outlined" size="small" color="error" onClick={(): void => setDeleteId(discount.id)}>
                  Delete
                </Button>
              </Stack>
            </Box>
          ))}
        </Box>
      ) : null}
      {matching.length > 0 && !compact ? (
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
            {visible.map((discount): React.JSX.Element => (
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
                  {guestLimitLabel(discount) === null ? null : (
                    <>
                      {' '}
                      <Chip size="small" variant="outlined" label={guestLimitLabel(discount)} />
                    </>
                  )}
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
      {matching.length > shown ? (
        <Button variant="outlined" onClick={(): void => setShown((count): number => count + DISCOUNT_PAGE_SIZE)}>
          Show {String(Math.min(DISCOUNT_PAGE_SIZE, matching.length - shown))} more
        </Button>
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
