/**
 * @file apps/admin/src/features/reservations/components/calendar-day-cell.tsx
 * @feature reservations
 * @dependencies MUI, status chip icons
 */

import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { CalendarDayOccupancy } from '@resort-booking/shared-types';
import { statusIcon } from '@/shared/components/status-chip';
import type { StatusIconKey } from '@/shared/utils/status-style';
import { dayAriaLabel, dayHasActivity, dayLanes, dominantTone } from '../utils/calendar-cells';

interface CalendarDayCellProps {
  date: string;
  day: CalendarDayOccupancy | undefined;
  selected: boolean;
  today: boolean;
  weekend: boolean;
  onSelect: (date: string) => void;
}

type PillTone = 'success' | 'info' | 'warning' | 'error';

interface LanePillProps {
  tone: PillTone;
  icon: StatusIconKey;
  count: number;
  label: string;
}

/**
 * One tonal line on a day: icon, count and word ("2 Booked"). The word and icon carry the meaning, not only the colour.
 */
function LanePill({ tone, icon, count, label }: LanePillProps): React.JSX.Element {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.75,
        py: 0.25,
        borderRadius: 1,
        typography: 'caption',
        fontWeight: 700,
        lineHeight: 1.3,
        color: `${tone}.dark`,
        bgcolor: (theme): string => alpha(theme.palette[tone].main, 0.14),
        '& svg': { fontSize: 14 },
      }}
    >
      {statusIcon(icon)}
      {count} {label}
    </Box>
  );
}

/**
 * One day on the month grid. Today is a filled circle, the selected day a ring, weekends a soft
 * tint, and a busy day is edged by its most pressing status.
 */
export function CalendarDayCell({ date, day, selected, today, weekend, onSelect }: CalendarDayCellProps): React.JSX.Element {
  const tone = dominantTone(day);
  return (
    <Box
      component="button"
      type="button"
      aria-label={dayAriaLabel(date, day)}
      aria-pressed={selected}
      aria-current={today ? 'date' : undefined}
      onClick={(): void => onSelect(date)}
      sx={{
        minHeight: 100,
        p: 1,
        textAlign: 'left',
        cursor: 'pointer',
        color: 'text.primary',
        font: 'inherit',
        border: selected ? 2 : 1,
        borderColor: selected ? 'primary.main' : 'divider',
        borderTop: tone === 'none' ? undefined : 4,
        borderTopColor: tone === 'none' ? undefined : (selected ? 'primary.main' : `${tone}.main`),
        borderRadius: 1.5,
        bgcolor: (theme): string =>
          selected
            ? alpha(theme.palette.primary.main, 0.1)
            : weekend
              ? alpha(theme.palette.primary.main, 0.045)
              : theme.palette.background.paper,
        transition: 'box-shadow 120ms, border-color 120ms',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: 2,
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 28,
          height: 28,
          mb: 0.5,
          borderRadius: '14px',
          typography: 'body2',
          fontWeight: today ? 800 : 600,
          bgcolor: today ? 'secondary.main' : 'transparent',
          color: today ? 'secondary.contrastText' : 'text.primary',
        }}
      >
        {Number.parseInt(date.slice(8), 10)}
      </Box>
      {day === undefined || !dayHasActivity(day) ? (
        <Typography variant="caption" color="text.secondary" display="block">
          Open
        </Typography>
      ) : (
        <Stack spacing={0.5} alignItems="flex-start">
          {dayLanes(day).map((lane): React.JSX.Element => (
            <LanePill key={lane.icon} tone={lane.tone} icon={lane.icon} count={lane.count} label={lane.label} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
