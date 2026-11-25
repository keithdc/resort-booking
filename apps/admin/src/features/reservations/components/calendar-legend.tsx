/**
 * @file apps/admin/src/features/reservations/components/calendar-legend.tsx
 * @feature reservations
 * @dependencies status chip
 */

import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { StatusChip } from '@/shared/components/status-chip';
import type { StatusStyle } from '@/shared/utils/status-style';

const LEGEND: StatusStyle[] = [
  { label: 'Booked', tone: 'success', icon: 'booked' },
  { label: 'Rebook', tone: 'info', icon: 'rebook' },
  { label: 'Hold (unpaid)', tone: 'warning', icon: 'hold' },
  { label: 'Cancelled', tone: 'error', icon: 'cancelled' },
];

/**
 * What the colours and icons on the grid mean, plus the two day markers (today and weekend).
 */
export function CalendarLegend(): React.JSX.Element {
  return (
    <Box
      component="ul"
      aria-label="Legend"
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, listStyle: 'none', m: 0, mb: 2, p: 0 }}
    >
      {LEGEND.map((status): React.JSX.Element => (
        <li key={status.label}>
          <StatusChip status={status} />
        </li>
      ))}
      <Box component="li" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Box
          aria-hidden
          sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: 'secondary.main' }}
        />
        <Typography variant="caption" color="text.secondary">
          Today
        </Typography>
      </Box>
      <Box component="li" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Box
          aria-hidden
          sx={{
            width: 14,
            height: 14,
            borderRadius: 0.5,
            border: 1,
            borderColor: 'divider',
            bgcolor: (theme): string => alpha(theme.palette.primary.main, 0.08),
          }}
        />
        <Typography variant="caption" color="text.secondary">
          Weekend
        </Typography>
      </Box>
    </Box>
  );
}
