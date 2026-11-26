/**
 * @file apps/admin/src/features/reservations/components/calendar-grid.tsx
 * @feature reservations
 * @dependencies calendar-day-cell
 */

import { Box, Typography } from '@mui/material';
import type { CalendarDayOccupancy } from '@resort-booking/shared-types';
import { buildMonthCells, isWeekendIso } from '../utils/calendar-cells';
import { CalendarCompactCell } from './calendar-compact-cell';
import { CalendarDayCell } from './calendar-day-cell';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CalendarGridProps {
  year: number;
  month: number;
  occupancy: Map<string, CalendarDayOccupancy>;
  selectedDate: string;
  todayIso: string;
  onSelect: (date: string) => void;
  /** Phone layout: seven narrow columns that fit the screen (no sideways scrolling). */
  compact?: boolean;
}

/**
 * The month as a 7-column grid, Monday first. On phones (`compact`) the columns shrink to fit and cells show icon + count only. Otherwise, on a narrow window it keeps a sensible minimum width and the page area scrolls sideways (see StaffShell), instead of the grid scrolling by itself.
 */
export function CalendarGrid({ year, month, occupancy, selectedDate, todayIso, onSelect, compact = false }: CalendarGridProps): React.JSX.Element {
  const cells = buildMonthCells(year, month);
  return (
    <Box>
      <Box
        sx={
          compact
            ? { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '3px' }
            : { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(104px, 1fr))', gap: 1, minWidth: 800 }
        }
      >
        {WEEKDAYS.map((day, index): React.JSX.Element => (
          <Typography
            key={day}
            variant="overline"
            color={index >= 5 ? 'primary.main' : 'text.secondary'}
            sx={compact ? { textAlign: 'center', lineHeight: 2, letterSpacing: 0, fontSize: 11 } : { px: 1, lineHeight: 2 }}
          >
            {day}
          </Typography>
        ))}
        {cells.map((cell, index): React.JSX.Element => {
          if (cell === null) {
            return <Box key={`empty-${String(index)}`} />;
          }
          const Cell = compact ? CalendarCompactCell : CalendarDayCell;
          return (
            <Cell
              key={cell}
              date={cell}
              day={occupancy.get(cell)}
              selected={cell === selectedDate}
              today={cell === todayIso}
              weekend={isWeekendIso(cell)}
              onSelect={onSelect}
            />
          );
        })}
      </Box>
    </Box>
  );
}
