/**
 * @file apps/admin/src/features/team/components/audit-page.tsx
 * @feature team
 * @dependencies use-audit, audit-labels
 */

'use client';

import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { Alert, Box, Button, MenuItem, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SectionCard } from '@/shared/components/section-card';
import { useAudit } from '../hooks/use-audit';
import { AUDIT_CATEGORIES, actionLabel, actorLabel, detailsLine } from '../utils/audit-labels';
import { formatDateTime } from '../utils/format-time';

/**
 * The audit log (admins only): who did what and when, newest first. Filter by kind of action and by date;
 * older entries load a page at a time.
 */
export function AuditPage(): React.JSX.Element {
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const audit = useAudit({ category, from, to });
  const filtered = category !== '' || from !== '' || to !== '';

  return (
    <>
      <PageHeader
        icon={<FactCheckOutlinedIcon />}
        tone="secondary"
        title="Audit log"
        description="A record of sign-ins, team changes and money-related actions in this workspace. Passwords and emails are never stored here."
      />
      <SectionCard icon={<FactCheckOutlinedIcon />} title="Activity" description="Newest first">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
          <TextField select size="small" label="What happened" value={category} onChange={(event): void => setCategory(event.target.value)} sx={{ minWidth: 240 }}>
            {AUDIT_CATEGORIES.map((option): React.JSX.Element => (
              <MenuItem key={option.prefix} value={option.prefix}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" type="date" label="From" value={from} onChange={(event): void => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="To" value={to} onChange={(event): void => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from === '' ? undefined : from } }} />
          {filtered ? (
            <Button
              onClick={(): void => {
                setCategory('');
                setFrom('');
                setTo('');
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </Stack>

        {audit.error !== null ? (
          <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={audit.reload}>Try again</Button>}>
            {audit.error}
          </Alert>
        ) : null}

        {audit.loading ? (
          <Stack spacing={1} aria-busy="true" aria-label="Loading audit log">
            <Skeleton variant="rounded" height={44} />
            <Skeleton variant="rounded" height={44} />
            <Skeleton variant="rounded" height={44} />
          </Stack>
        ) : audit.records.length === 0 && audit.error === null ? (
          <EmptyState
            icon={<FactCheckOutlinedIcon />}
            title={filtered ? 'Nothing matches these filters' : 'No activity recorded yet'}
            hint={filtered ? 'Try a wider date range or another kind of action.' : 'Actions such as sign-ins and team changes appear here.'}
          />
        ) : (
          <>
            <TableContainer>
              <Table size="small" aria-label="Audit log">
                <TableHead>
                  <TableRow>
                    <TableCell>When</TableCell>
                    <TableCell>Who</TableCell>
                    <TableCell>What</TableCell>
                    <TableCell>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {audit.records.map((record): React.JSX.Element => (
                    <TableRow key={record.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(record.createdAt)}</TableCell>
                      <TableCell>{actorLabel(record)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {actionLabel(record.action)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {record.action}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{detailsLine(record.metadata)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {audit.hasMore ? (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Button variant="outlined" onClick={audit.loadMore} disabled={audit.loadingMore}>
                  {audit.loadingMore ? 'Loading…' : 'Load older entries'}
                </Button>
              </Box>
            ) : null}
          </>
        )}
      </SectionCard>
    </>
  );
}
