/**
 * @file apps/admin/src/features/reservations/components/calendar-compact-cell.tsx
 * @feature reservations
 * @dependencies MUI, status chip icons
 */

import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { CalendarDayOccupancy } from '@resort-booking/shared-types';
import { statusIcon } from '@/shared/components/status-chip';
import { dayAriaLabel, dayLanes, dominantTone } from '../utils/calendar-cells';

interface CalendarCompactCellProps {
  date: string;
  day: CalendarDayOccupancy | undefined;
  selected: boolean;
  today: boolean;
  weekend: boolean;
  onSelect: (date: string) => void;
}

/**
 * One day on the phone grid: the date and a tiny icon + count per status (the colour is never the only
 * signal), about 45px wide so seven columns fit a 360px screen. Tap selects; details sit in the day panel.
 */
export function CalendarCompactCell({ date, day, selected, today, weekend, onSelect }: CalendarCompactCellProps): React.JSX.Element {
  const tone = dominantTone(day);
  const lanes = dayLanes(day);
  return (
    <Box
      component="button"
      type="button"
      aria-label={dayAriaLabel(date, day)}
      aria-pressed={selected}
      aria-current={today ? 'date' : undefined}
      onClick={(): void => onSelect(date)}
      sx={{
        minWidth: 0,
        minHeight: 62,
        p: 0.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.25,
        cursor: 'pointer',
        color: 'text.primary',
        font: 'inherit',
        border: selected ? 2 : 1,
        borderColor: selected ? 'primary.main' : 'divider',
        borderTop: tone === 'none' ? undefined : 3,
        borderTopColor: tone === 'none' ? undefined : selected ? 'primary.main' : `${tone}.main`,
        borderRadius: 1,
        bgcolor: (theme): string =>
          selected
            ? alpha(theme.palette.primary.main, 0.1)
            : weekend
              ? alpha(theme.palette.primary.main, 0.045)
              : theme.palette.background.paper,
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 24,
          height: 24,
          borderRadius: '12px',
          typography: 'body2',
          fontWeight: today ? 800 : 600,
          bgcolor: today ? 'secondary.main' : 'transparent',
          color: today ? 'secondary.contrastText' : 'text.primary',
        }}
      >
        {Number.parseInt(date.slice(8), 10)}
      </Box>
      <Box component="span" aria-hidden sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2px' }}>
        {lanes.map((lane): React.JSX.Element => (
          <Box
            key={lane.icon}
            component="span"
            data-lane={lane.icon}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '1px',
              px: '3px',
              borderRadius: '4px',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: '16px',
              color: `${lane.tone}.dark`,
              bgcolor: (theme): string => alpha(theme.palette[lane.tone].main, 0.14),
              '& svg': { fontSize: 11 },
            }}
          >
            {statusIcon(lane.icon)}
            {lane.count}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
