/**
 * @file apps/admin/src/features/reporting/components/overview-tab.tsx
 * @feature reporting
 * @dependencies combined-chart, report-insights
 */

import { Alert, Box } from '@mui/material';
import type { StaffReport } from '@resort-booking/shared-types';
import { buildChartSeries, type ChartBucket } from '../utils/report-chart';
import { buildInsights } from '../utils/report-insights';
import { stayOccupiesDay } from '../utils/stay-window';
import { CombinedChart } from './combined-chart';
import { useMoneyHidden } from './money-visibility';
import { EmptyNote, ReportSection } from './report-section';
import type { ReportDetail } from './report-detail-dialog';

interface OverviewTabProps {
  report: StaffReport;
  onOpenDetail: (detail: ReportDetail) => void;
}

/**
 * The big picture: one chart of revenue and occupancy, and a few plain sentences about the period.
 */
export function OverviewTab({ report, onOpenDetail }: OverviewTabProps): React.JSX.Element {
  const moneyHidden = useMoneyHidden();
  const buckets = buildChartSeries(report.daily, report.houseCount);
  const hasData = report.reservationCount > 0;
  const insights = hasData && !moneyHidden ? buildInsights(report) : [];

  const open = (bucket: ChartBucket): void => {
    onOpenDetail({
      title: bucket.title,
      caption: 'Confirmed bookings with a night on these dates.',
      stays: report.stays.filter((stay): boolean => bucket.dates.some((date: string): boolean => stayOccupiesDay(stay, date))),
    });
  };

  if (moneyHidden) {
    // The chart and the insight sentences are about revenue, which is withheld; the cards above carry bookings and occupancy.
    return (
      <Alert severity="info">
        The revenue chart and the revenue insights are for admins. Bookings, nights and occupancy are shown above and on the other tabs.
      </Alert>
    );
  }

  return (
    <>
      <ReportSection section="revenueChart">
        {buckets.length === 0 || !hasData ? (
          <EmptyNote state="noChartData" />
        ) : (
          <CombinedChart buckets={buckets} currencyCode={report.currencyCode} onSelect={open} />
        )}
      </ReportSection>
      <ReportSection section="insights">
        {insights.length === 0 ? (
          <EmptyNote state="noBookings" />
        ) : (
          <Box component="ul" sx={{ m: 0, pl: 3, display: 'grid', gap: 1 }}>
            {insights.map((sentence: string): React.JSX.Element => (
              <li key={sentence}>{sentence}</li>
            ))}
          </Box>
        )}
      </ReportSection>
    </>
  );
}
