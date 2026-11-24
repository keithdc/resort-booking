/**
 * @file apps/admin/src/features/reporting/components/report-body.tsx
 * @feature reporting
 * @dependencies the five tab components
 */

'use client';

import { Box, Tab, Tabs, Typography } from '@mui/material';
import type { StaffReport } from '@resort-booking/shared-types';
import { TAB_PURPOSES, type ReportTabKey } from '../utils/metric-definitions';
import type { BookingStatusKey } from '../utils/report-labels';
import { REPORT_TABS } from '../utils/report-tabs';
import { BookingsTab } from './bookings-tab';
import { CancellationsTab } from './cancellations-tab';
import { OverviewTab } from './overview-tab';
import { PaymentsTab } from './payments-tab';
import { PropertiesTab } from './properties-tab';
import type { ReportDetail } from './report-detail-dialog';

interface ReportBodyProps {
  report: StaffReport;
  tab: ReportTabKey;
  onTabChange: (tab: ReportTabKey) => void;
  bookingStatus: BookingStatusKey | null;
  onBookingStatusChange: (status: BookingStatusKey | null) => void;
  onOpenDetail: (detail: ReportDetail) => void;
  onChanged: () => void;
}

/**
 * The tab bar, the one-line purpose of the open tab, and the five tab panels. Every panel stays in the
 * page (the closed ones are only hidden) so printing shows the whole report in order.
 */
export function ReportBody({
  report,
  tab,
  onTabChange,
  bookingStatus,
  onBookingStatusChange,
  onOpenDetail,
  onChanged,
}: ReportBodyProps): React.JSX.Element {
  return (
    <Box>
      <Box data-print="hide">
        <Tabs
          value={tab}
          onChange={(_event, next: ReportTabKey): void => onTabChange(next)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Report sections"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {REPORT_TABS.map((option): React.JSX.Element => (
            <Tab key={option.key} value={option.key} label={option.label} id={`report-tab-${option.key}`} aria-controls={`report-panel-${option.key}`} sx={{ textTransform: 'none' }} />
          ))}
        </Tabs>
        <Typography color="text.secondary" sx={{ mt: 3, mb: 4, maxWidth: 680, lineHeight: 1.6 }}>
          {TAB_PURPOSES[tab]}
        </Typography>
      </Box>
      {REPORT_TABS.map((option): React.JSX.Element => (
        <Box key={option.key} role="tabpanel" id={`report-panel-${option.key}`} aria-labelledby={`report-tab-${option.key}`} hidden={tab !== option.key} sx={{ pt: 1, pb: 4 }}>
          <Typography variant="h5" component="h2" data-print="only" sx={{ display: 'none', mb: 1 }}>
            {option.label}
          </Typography>
          {option.key === 'overview' ? <OverviewTab report={report} onOpenDetail={onOpenDetail} /> : null}
          {option.key === 'properties' ? <PropertiesTab report={report} onOpenDetail={onOpenDetail} /> : null}
          {option.key === 'bookings' ? <BookingsTab report={report} status={bookingStatus} onStatusChange={onBookingStatusChange} onChanged={onChanged} /> : null}
          {option.key === 'cancellations' ? <CancellationsTab report={report} /> : null}
          {option.key === 'payments' ? <PaymentsTab report={report} /> : null}
        </Box>
      ))}
    </Box>
  );
}
