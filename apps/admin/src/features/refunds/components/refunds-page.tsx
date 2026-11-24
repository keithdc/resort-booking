/**
 * @file apps/admin/src/features/refunds/components/refunds-page.tsx
 * @feature refunds
 * @dependencies use-refunds, refund dialogs, staff-property-api
 */

'use client';

import type { PropertySummary, StaffRefund } from '@resort-booking/shared-types';
import ClearIcon from '@mui/icons-material/Clear';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
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
import { useEffect, useState } from 'react';
import { fetchStaffProperties } from '@/features/property/services/staff-property-api';
import { reasonLabel, refundKindLabel, refundStatusColor, refundStatusLabel } from '@/shared/utils/booking-labels';
import { formatCents } from '@/shared/utils/money';
import { useRefunds } from '../hooks/use-refunds';
import { REFUND_FILTERS } from '../utils/refund-filters';
import { MarkRefundPaidDialog } from './mark-refund-paid-dialog';
import { RefundDetailDialog } from './refund-detail-dialog';

const ALL_PROPERTIES = 'all';

/**
 * Refunds that need a person: failed ones to retry, and hand refunds to send and then mark as
 * done. Filter by status and property, search, open a refund for the details and actions.
 */
export function RefundsPage(): React.JSX.Element {
  const state = useRefunds();
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect((): void => {
    fetchStaffProperties()
      .then(setProperties)
      .catch((): void => {
        // The property filter is a convenience: without it the page still works for all properties.
        setProperties([]);
      });
  }, []);

  const open = state.visible.find((refund): boolean => refund.id === openId) ?? null;
  const marking = state.visible.find((refund): boolean => refund.id === markingId) ?? null;

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <ReplayOutlinedIcon color="primary" />
        <Typography variant="h4" component="h1">
          Refunds
        </Typography>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Refunds that need a person. Retry one that failed, or send a hand refund yourself and mark it as done.
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap role="group" aria-label="Filter refunds">
          {REFUND_FILTERS.map((option): React.JSX.Element => (
            <Chip
              key={option.filter}
              label={option.label}
              color={state.filter === option.filter ? 'primary' : 'default'}
              variant={state.filter === option.filter ? 'filled' : 'outlined'}
              aria-pressed={state.filter === option.filter}
              onClick={(): void => state.setFilter(option.filter)}
            />
          ))}
        </Stack>
        <Select
          size="small"
          value={state.propertyId === '' ? ALL_PROPERTIES : state.propertyId}
          onChange={(event): void => state.setPropertyId(event.target.value === ALL_PROPERTIES ? '' : event.target.value)}
          inputProps={{ 'aria-label': 'Property' }}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value={ALL_PROPERTIES}>All properties</MenuItem>
          {properties.map((property): React.JSX.Element => (
            <MenuItem key={property.id} value={property.id}>
              {property.name}
            </MenuItem>
          ))}
        </Select>
        <TextField
          size="small"
          label="Search"
          placeholder="Reference, guest, stay"
          value={state.query}
          onChange={(event): void => state.setQuery(event.target.value)}
          slotProps={{
            input: {
              endAdornment:
                state.query === '' ? undefined : (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Clear search" onClick={(): void => state.setQuery('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
            },
          }}
        />
      </Stack>
      {state.error !== null ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      ) : null}
      {state.loading ? (
        <Stack direction="row" spacing={1} alignItems="center" aria-label="Loading refunds">
          <CircularProgress size={20} />
          <Typography color="text.secondary">Loading refunds…</Typography>
        </Stack>
      ) : null}
      {!state.loading && state.error === null && state.visible.length === 0 ? (
        <Typography color="text.secondary">
          {state.total > 0
            ? 'No refund matches your search.'
            : state.filter === 'attention'
              ? 'Nothing needs your attention.'
              : 'No refunds here.'}
        </Typography>
      ) : null}
      {!state.loading && state.visible.length > 0 ? (
        <Table size="small" aria-label="Refunds">
          <TableHead>
            <TableRow>
              <TableCell>Booking</TableCell>
              <TableCell>Guest</TableCell>
              <TableCell>Stay</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Provider</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.visible.map((refund: StaffRefund): React.JSX.Element => (
              <TableRow key={refund.id} hover sx={{ cursor: 'pointer' }} onClick={(): void => setOpenId(refund.id)}>
                <TableCell>{refund.reference}</TableCell>
                <TableCell>{refund.bookerName}</TableCell>
                <TableCell>
                  {refund.stayName}, {refund.propertyName}
                </TableCell>
                <TableCell>
                  {formatCents(refund.amountCents, refund.currencyCode)} ({String(refund.percent)}%)
                </TableCell>
                <TableCell>{refundKindLabel(refund.kind)}</TableCell>
                <TableCell>
                  <Chip size="small" color={refundStatusColor(refund.status)} label={refundStatusLabel(refund.status)} />
                </TableCell>
                <TableCell>{refund.provider === 'manual' ? 'By hand' : refund.provider}</TableCell>
                <TableCell>{refund.failureReason ?? reasonLabel(refund.reason)}</TableCell>
                <TableCell>{refund.createdAt.slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <RefundDetailDialog
        refund={open}
        busy={state.busyId !== null}
        error={marking === null ? state.actionError : null}
        onClose={(): void => {
          state.clearActionError();
          setOpenId(null);
        }}
        onRetry={(refund): void => {
          void state.retry(refund.id);
        }}
        onMarkPaid={(refund): void => {
          state.clearActionError();
          setMarkingId(refund.id);
        }}
      />
      {marking !== null ? (
        <MarkRefundPaidDialog
          open
          refund={marking}
          saving={state.busyId !== null}
          error={state.actionError}
          onClose={(): void => {
            state.clearActionError();
            setMarkingId(null);
          }}
          onConfirm={(note): void => {
            void state.markPaid(marking.id, note).then((ok): void => {
              if (ok) {
                setMarkingId(null);
              }
            });
          }}
        />
      ) : null}
      <Snackbar open={state.notice !== null} autoHideDuration={5000} onClose={state.clearNotice}>
        <Alert severity="success" onClose={state.clearNotice}>
          {state.notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}
