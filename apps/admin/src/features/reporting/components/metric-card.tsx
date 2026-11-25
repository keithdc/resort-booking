/**
 * @file apps/admin/src/features/reporting/components/metric-card.tsx
 * @feature reporting
 * @dependencies metric-info
 */

import DonutLargeOutlinedIcon from '@mui/icons-material/DonutLargeOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import { Box, Paper, Typography } from '@mui/material';
import type { ReactElement } from 'react';
import { IconChip } from '@/shared/components/icon-chip';
import type { AvatarTone } from '@/shared/utils/avatar-color';
import type { GlanceCard } from '../utils/glance-cards';
import { MetricInfo } from './metric-info';

interface MetricCardProps {
  card: GlanceCard;
}

/** A distinct hue and icon per headline number; the label always says the same thing in words. */
const CARD_LOOK: Record<GlanceCard['key'], { tone: AvatarTone; icon: ReactElement }> = {
  revenue: { tone: 'success', icon: <PaymentsOutlinedIcon /> },
  bookings: { tone: 'primary', icon: <EventAvailableOutlinedIcon /> },
  occupancy: { tone: 'info', icon: <DonutLargeOutlinedIcon /> },
  averageNightlyRate: { tone: 'secondary', icon: <SellOutlinedIcon /> },
};

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
  const look = CARD_LOOK[card.key];
  return (
    <Paper
      elevation={1}
      sx={{ p: 3, borderRadius: 2, height: '100%', breakInside: 'avoid', borderTop: 4, borderColor: `${look.tone}.main` }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="overline" color="text.secondary" component="h3" sx={{ lineHeight: 1.6 }}>
            {card.label}
          </Typography>
          <MetricInfo metric={card.metric} />
        </Box>
        <IconChip icon={look.icon} tone={look.tone} size={36} />
      </Box>
      <Typography variant="h4" component="p" sx={{ fontWeight: 600, mt: 1, mb: 1.5 }}>
        {card.value}
      </Typography>
      {card.secondary !== null ? (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          {card.secondary}
        </Typography>
      ) : null}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
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
