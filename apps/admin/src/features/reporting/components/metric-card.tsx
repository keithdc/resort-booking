/**
 * @file apps/admin/src/features/reporting/components/metric-card.tsx
 * @feature reporting
 * @dependencies metric-info
 */

import { Box, Paper, Typography } from '@mui/material';
import type { GlanceCard } from '../utils/glance-cards';
import { MetricInfo } from './metric-info';

interface MetricCardProps {
  card: GlanceCard;
}

const CHANGE_COLOR: Record<GlanceCard['change']['direction'], string> = {
  up: 'success.main',
  down: 'error.main',
  same: 'text.secondary',
  none: 'text.secondary',
};

/**
 * One headline number with its plain explanation and how it moved. The change is always written out
 * (arrow plus words), never shown by colour alone.
 */
export function MetricCard({ card }: MetricCardProps): React.JSX.Element {
  const { change } = card;
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%', breakInside: 'avoid' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="overline" color="text.secondary" component="h3" sx={{ lineHeight: 1.6 }}>
          {card.label}
        </Typography>
        <MetricInfo metric={card.metric} />
      </Box>
      <Typography variant="h4" component="p" sx={{ fontWeight: 600, my: 0.5 }}>
        {card.value}
      </Typography>
      {card.secondary !== null ? (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          {card.secondary}
        </Typography>
      ) : null}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {card.explanation}
      </Typography>
      <Box sx={{ color: CHANGE_COLOR[change.direction] }} aria-label={`Compared with the period before: ${change.long}`}>
        <Typography variant="body2" component="span" sx={{ fontWeight: 700, mr: 1 }}>
          {change.short}
        </Typography>
        <Typography variant="caption" component="span" color="text.secondary">
          {change.long}
        </Typography>
      </Box>
    </Paper>
  );
}
