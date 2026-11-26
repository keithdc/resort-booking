/**
 * @file apps/admin/src/features/reservations/components/calendar-grid.tsx
 * @feature reservations
 * @dependencies calendar-day-cell
 */

import { Box, Typography } from '@mui/material';
import type { CalendarDayOccupancy } from '@resort-booking/shared-types';
import { buildMonthCells, isWeekendIso } from '../utils/calendar-cells';
import { CalendarDayCell } from './calendar-day-cell';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CalendarGridProps {
  year: number;
  month: number;
  occupancy: Map<string, CalendarDayOccupancy>;
  selectedDate: string;
  todayIso: string;
  onSelect: (date: string) => void;
}

/**
 * The month as a 7-column grid, Monday first. On a narrow window it keeps a sensible minimum width and the page area scrolls sideways (see StaffShell), instead of the grid scrolling by itself.
 */
export function CalendarGrid({ year, month, occupancy, selectedDate, todayIso, onSelect }: CalendarGridProps): React.JSX.Element {
  const cells = buildMonthCells(year, month);
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(104px, 1fr))', gap: 1, minWidth: 800 }}>
        {WEEKDAYS.map((day, index): React.JSX.Element => (
          <Typography
            key={day}
            variant="overline"
            color={index >= 5 ? 'primary.main' : 'text.secondary'}
            sx={{ px: 1, lineHeight: 2 }}
          >
            {day}
          </Typography>
        ))}
        {cells.map((cell, index): React.JSX.Element => {
          if (cell === null) {
            return <Box key={`empty-${String(index)}`} />;
          }
          return (
            <CalendarDayCell
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
