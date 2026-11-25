/**
 * @file apps/admin/src/features/reservations/components/calendar-day-panel.tsx
 * @feature reservations
 * @dependencies day-booking-card, empty state
 */

import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { Box, Paper, Skeleton, Stack, Typography } from '@mui/material';
import type { StaffReservation } from '@resort-booking/shared-types';
import { EmptyState } from '@/shared/components/empty-state';
import { IconChip } from '@/shared/components/icon-chip';
import { longDateLabel } from '../utils/calendar-cells';
import { DayBookingCard } from './day-booking-card';

interface CalendarDayPanelProps {
  date: string;
  guests: StaffReservation[];
  loading: boolean;
  openStayId: string | null;
  onOpen: (id: string) => void;
}

/**
 * Everything on the selected day: a heading with the date and the count, then one card per
 * booking (or a friendly empty state).
 */
export function CalendarDayPanel({ date, guests, loading, openStayId, onOpen }: CalendarDayPanelProps): React.JSX.Element {
  return (
    <Paper component="section" aria-label="Day details" elevation={1} sx={{ mt: 3, borderRadius: 2, overflow: 'hidden' }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
        <IconChip icon={<TodayOutlinedIcon />} tone="secondary" size={36} />
        <Box>
          <Typography variant="h6" component="h2">
            Bookings on {date}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {longDateLabel(date)}
            {loading ? '' : ` · ${String(guests.length)} ${guests.length === 1 ? 'booking' : 'bookings'}`}
          </Typography>
        </Box>
      </Stack>
      <Box sx={{ p: 2 }}>
        {loading ? (
          <Stack spacing={1} aria-label="Loading bookings" aria-busy="true">
            <Skeleton variant="rounded" height={58} />
            <Skeleton variant="rounded" height={58} />
          </Stack>
        ) : guests.length === 0 ? (
          <EmptyState
            icon={<EventBusyOutlinedIcon />}
            title="No bookings on this date"
            hint="Pick another day on the calendar, or change the property filter."
          />
        ) : (
          <Box component="ul" aria-label="Bookings on this day" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
            {guests.map((stay): React.JSX.Element => (
              <li key={stay.id}>
                <DayBookingCard stay={stay} selected={stay.id === openStayId} onOpen={onOpen} />
              </li>
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
