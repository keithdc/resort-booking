/**
 * @file apps/admin/src/features/reporting/components/report-section.tsx
 * @feature reporting
 * @dependencies metric-definitions
 */

import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { Box, Stack, Typography } from '@mui/material';
import type { ReactElement } from 'react';
import { EmptyState } from '@/shared/components/empty-state';
import { IconChip } from '@/shared/components/icon-chip';
import type { AvatarTone } from '@/shared/utils/avatar-color';
import { EMPTY_STATES, SECTION_CAPTIONS, type EmptyStateKey, type SectionKey } from '../utils/metric-definitions';

interface ReportSectionProps {
  section: SectionKey;
  /** Heading level under the page's h1: 2 for a top section, 3 inside a tab. */
  level?: 2 | 3;
  children: React.ReactNode;
}

const SECTION_LOOK: Record<SectionKey, { tone: AvatarTone; icon: ReactElement }> = {
  atAGlance: { tone: 'primary', icon: <SpeedOutlinedIcon /> },
  attention: { tone: 'warning', icon: <NotificationsActiveOutlinedIcon /> },
  revenueChart: { tone: 'success', icon: <BarChartOutlinedIcon /> },
  insights: { tone: 'secondary', icon: <AutoAwesomeOutlinedIcon /> },
  propertiesTable: { tone: 'info', icon: <HolidayVillageOutlinedIcon /> },
  bookingsTable: { tone: 'primary', icon: <EventAvailableOutlinedIcon /> },
  cancellationSummary: { tone: 'error', icon: <TableChartOutlinedIcon /> },
  cancellationReasons: { tone: 'error', icon: <TableChartOutlinedIcon /> },
  refundsList: { tone: 'secondary', icon: <ReplayOutlinedIcon /> },
  paymentMethods: { tone: 'success', icon: <AccountBalanceWalletOutlinedIcon /> },
  discounts: { tone: 'secondary', icon: <LocalOfferOutlinedIcon /> },
};

/**
 * A titled block with the plain sentence under it that says what it shows and how to use it.
 */
export function ReportSection({ section, level = 3, children }: ReportSectionProps): React.JSX.Element {
  const { title, caption } = SECTION_CAPTIONS[section];
  return (
    <Box component="section" aria-label={title} sx={{ mb: 7, breakInside: 'avoid-page' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.75 }}>
        <IconChip icon={SECTION_LOOK[section].icon} tone={SECTION_LOOK[section].tone} size={36} />
        <Typography variant={level === 2 ? 'h5' : 'h6'} component={level === 2 ? 'h2' : 'h3'}>
          {title}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 680, lineHeight: 1.6 }}>
        {caption}
      </Typography>
      {children}
    </Box>
  );
}

interface EmptyNoteProps {
  state: EmptyStateKey;
}

/**
 * An empty section: says why it is empty and what to try.
 */
export function EmptyNote({ state }: EmptyNoteProps): React.JSX.Element {
  return <EmptyState icon={<InboxOutlinedIcon />} title={EMPTY_STATES[state]} />;
}
