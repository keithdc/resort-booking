/**
 * @file apps/admin/src/features/reporting/components/reports-page.tsx
 * @feature reporting
 * @dependencies reporting hooks and components
 */

'use client';

import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { useState } from 'react';
import { downloadTextFile } from '@/shared/utils/download-text-file';
import { formatIsoDate } from '@/shared/utils/format-date';
import { useReportData } from '../hooks/use-report-data';
import { useReportPeriod } from '../hooks/use-report-period';
import { useReportTab } from '../hooks/use-report-tab';
import { isMoneyHidden } from '../utils/money-hidden';
import { buildReportCsv, csvFileName } from '../utils/report-csv';
import { EMPTY_STATES, type ReportTabKey } from '../utils/metric-definitions';
import { describePeriod, shiftIso } from '../utils/report-range';
import type { BookingFilter } from '../utils/report-labels';
import { AtAGlance } from './at-a-glance';
import { AttentionStrip } from './attention-strip';
import { MoneyVisibility } from './money-visibility';
import { PrintStyles } from './print-styles';
import { PrintTitleBlock } from './print-title-block';
import { ReportBody } from './report-body';
import { ReportDetailDialog, type ReportDetail } from './report-detail-dialog';
import { ReportGlossary } from './report-glossary';
import { ReportHeader } from './report-header';
import { VISUALLY_HIDDEN } from '@/shared/utils/visually-hidden';

/**
 * The owner report. Everything on it comes from the API; this page only chooses the period and
 * property, arranges the sections, and offers CSV download and printing.
 */
export function ReportsPage(): React.JSX.Element {
  const period = useReportPeriod();
  const [propertyId, setPropertyId] = useState('');
  const { properties, report, loading, error, reload } = useReportData(period.range, propertyId);
  const { tab, setTab } = useReportTab();
  const [bookingStatus, setBookingStatus] = useState<BookingFilter | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);

  const propertyName = properties.find((property): boolean => property.id === propertyId)?.name ?? 'All properties';
  const periodLabel = report === null ? '' : describePeriod(report.from, report.to);
  const moneyHidden = report !== null && isMoneyHidden(report);

  const download = (): void => {
    if (report === null) {
      return;
    }
    const csv = buildReportCsv(report, { propertyName, periodLabel, generatedOn: report.asOfDate, moneyHidden });
    downloadTextFile(csvFileName(report.from, shiftIso(report.to, -1)), csv);
  };

  const openFromAttention = (target: ReportTabKey, filter: BookingFilter | null): void => {
    if (target === 'bookings') {
      setBookingStatus(filter ?? 'awaiting_payment');
    }
    setTab(target);
  };

  return (
    <MoneyVisibility hidden={moneyHidden}>
    <Box>
      <PrintStyles />
      <ReportHeader
        period={period}
        properties={properties}
        propertyId={propertyId}
        onPropertyChange={setPropertyId}
        loading={loading}
        canExport={report !== null}
        onDownload={download}
        onPrint={(): void => window.print()}
        onRefresh={reload}
      />

      {period.range === null ? (
        <Typography color="text.secondary">Pick a first and a last day to see the report.</Typography>
      ) : null}
      {error !== null ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={reload}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}
      {loading && report === null && period.range !== null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }} aria-busy="true">
          <CircularProgress aria-label="Loading the report" />
        </Box>
      ) : null}
      {report === null && !loading && error === null && period.range !== null ? <Typography color="text.secondary">{EMPTY_STATES.noReport}</Typography> : null}

      {report !== null ? (
        <Box aria-busy={loading} sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <PrintTitleBlock propertyName={propertyName} periodLabel={periodLabel} generatedOn={formatIsoDate(report.asOfDate)} />
          <Box aria-live="polite" sx={VISUALLY_HIDDEN}>
            {loading ? 'Updating the report' : `Showing ${propertyName} for ${periodLabel}`}
          </Box>
          {moneyHidden ? (
            <Alert severity="info" icon={<LockOutlinedIcon />} sx={{ mb: 3 }}>
              Revenue, refunds and amounts are for admins and for team members with refund access. You can see bookings, nights, occupancy and arrivals. Ask an admin if you need the money figures.
            </Alert>
          ) : null}
          <AtAGlance report={report} />
          <AttentionStrip attention={report.attention} currencyCode={report.currencyCode} onOpenTab={openFromAttention} />
          <ReportBody
            report={report}
            tab={tab}
            onTabChange={setTab}
            bookingStatus={bookingStatus}
            onBookingStatusChange={setBookingStatus}
            onOpenDetail={setDetail}
            onChanged={reload}
          />
          <ReportGlossary />
        </Box>
      ) : null}
      <ReportDetailDialog detail={detail} onClose={(): void => setDetail(null)} />
    </Box>
    </MoneyVisibility>
  );
}
