/**
 * @file apps/admin/src/features/refunds/components/refunds-page.tsx
 * @feature refunds
 * @dependencies use-refunds, refund dialogs, staff-property-api
 */

'use client';

import type { PropertySummary, StaffRefund } from '@resort-booking/shared-types';
import ClearIcon from '@mui/icons-material/Clear';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { fetchStaffProperties } from '@/features/property/services/staff-property-api';
import { EmptyState } from '@/shared/components/empty-state';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useCanManageRefunds } from '@/shared/hooks/use-staff-role';
import { PageHeader } from '@/shared/components/page-header';
import { StatusChip } from '@/shared/components/status-chip';
import { reasonLabel, refundKindLabel } from '@/shared/utils/booking-labels';
import { formatCents } from '@/shared/utils/money';
import { refundStyle } from '@/shared/utils/status-style';
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
  const compact = useCompactLayout();
  const canManageRefunds = useCanManageRefunds();
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
      <PageHeader
        icon={<ReplayOutlinedIcon />}
        tone="secondary"
        title="Refunds"
        description="Refunds that need a person. Retry one that failed, or send a hand refund yourself and mark it as done."
      />
      <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
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
          sx={{ minWidth: { md: 200 } }}
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
      </Paper>
      {state.error !== null ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      ) : null}
      {state.loading ? (
        <Stack spacing={1} aria-label="Loading refunds" aria-busy="true">
          <Skeleton variant="rounded" height={44} />
          <Skeleton variant="rounded" height={44} />
          <Skeleton variant="rounded" height={44} />
        </Stack>
      ) : null}
      {!state.loading && state.error === null && state.visible.length === 0 ? (
        state.total > 0 ? (
          <EmptyState icon={<SearchOffOutlinedIcon />} title="No refund matches your search." hint="Clear the search or pick another filter." />
        ) : state.filter === 'attention' ? (
          <EmptyState icon={<CheckCircleOutlineIcon />} title="Nothing needs your attention." hint="Failed refunds and refunds to send by hand show up here." />
        ) : (
          <EmptyState icon={<ReplayOutlinedIcon />} title="No refunds here." hint="Try another status filter." />
        )
      ) : null}
      {!state.loading && state.visible.length > 0 ? (
        compact ? (
          <Box component="ul" aria-label="Refunds" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
            {state.visible.map((refund: StaffRefund): React.JSX.Element => (
              <Box
                component="li"
                key={refund.id}
                sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}
              >
                <Box
                  component="button"
                  type="button"
                  aria-label={`Open refund ${refund.reference}`}
                  onClick={(): void => setOpenId(refund.id)}
                  sx={{ display: 'block', width: '100%', p: 1.5, textAlign: 'left', font: 'inherit', color: 'text.primary', bgcolor: 'transparent', border: 0, cursor: 'pointer' }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>{refund.reference}</Typography>
                      <Typography variant="body2">{refund.bookerName}</Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatCents(refund.amountCents, refund.currencyCode)} ({String(refund.percent)}%)
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {refund.stayName}, {refund.propertyName}
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
                    <StatusChip status={refundStyle(refund.status)} />
                    <Chip size="small" variant="outlined" label={refundKindLabel(refund.kind)} />
                    <Chip size="small" variant="outlined" label={refund.provider === 'manual' ? 'By hand' : refund.provider} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {refund.failureReason ?? reasonLabel(refund.reason)} · {refund.createdAt.slice(0, 10)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
        <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
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
                <TableCell sx={{ fontWeight: 600 }}>{refund.reference}</TableCell>
                <TableCell>{refund.bookerName}</TableCell>
                <TableCell>
                  {refund.stayName}, {refund.propertyName}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {formatCents(refund.amountCents, refund.currencyCode)} ({String(refund.percent)}%)
                </TableCell>
                <TableCell>{refundKindLabel(refund.kind)}</TableCell>
                <TableCell>
                  <StatusChip status={refundStyle(refund.status)} />
                </TableCell>
                <TableCell>{refund.provider === 'manual' ? 'By hand' : refund.provider}</TableCell>
                <TableCell>{refund.failureReason ?? reasonLabel(refund.reason)}</TableCell>
                <TableCell>{refund.createdAt.slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
        </Paper>
        )
      ) : null}
      <RefundDetailDialog
        refund={open}
        busy={state.busyId !== null}
        canManageRefunds={canManageRefunds}
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
