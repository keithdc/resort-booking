/**
 * @file apps/admin/src/features/reporting/components/at-a-glance.tsx
 * @feature reporting
 * @dependencies glance-cards, metric-card
 */

import { Box } from '@mui/material';
import type { StaffReport } from '@resort-booking/shared-types';
import { buildGlanceCards, type GlanceCard } from '../utils/glance-cards';
import { MetricCard } from './metric-card';
import { useMoneyHidden } from './money-visibility';
import { ReportSection } from './report-section';

interface AtAGlanceProps {
  report: StaffReport;
}

/**
 * The four headline cards: revenue, bookings, occupancy and average nightly rate.
 */
export function AtAGlance({ report }: AtAGlanceProps): React.JSX.Element {
  const moneyHidden = useMoneyHidden();
  // An employee sees bookings and occupancy; revenue and average rate are withheld by the API.
  const cards = buildGlanceCards(report).filter((card: GlanceCard): boolean => !moneyHidden || (card.key !== 'revenue' && card.key !== 'averageNightlyRate'));
  return (
    <ReportSection section="atAGlance" level={2}>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
        {cards.map((card: GlanceCard): React.JSX.Element => (
          <MetricCard key={card.key} card={card} />
        ))}
      </Box>
    </ReportSection>
  );
}
