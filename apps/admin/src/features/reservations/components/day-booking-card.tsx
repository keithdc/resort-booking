/**
 * @file apps/admin/src/features/reservations/components/day-booking-card.tsx
 * @feature reservations
 * @dependencies status chip, avatar
 */

import { Box, Stack, Typography } from '@mui/material';
import type { StaffReservation } from '@resort-booking/shared-types';
import { StatusChip } from '@/shared/components/status-chip';
import { UserAvatar } from '@/shared/components/user-avatar';
import { formatIsoDate, formatShortDate } from '@/shared/utils/format-date';
import { formatCents } from '@/shared/utils/money';
import { stayStatusStyle } from '@/shared/utils/status-style';
import { nightsBetween } from '../utils/dates';
import { PaymentStatusChip } from './payment-status-chip';

interface DayBookingCardProps {
  stay: StaffReservation;
  selected: boolean;
  onOpen: (id: string) => void;
}

/**
/**
 * One dense row in the day panel (about 60px): name and status on the first line, one truncated
 * line of details ("Stay · Property · 25 Nov → 26 Nov · 1 night · 2 guests", full text in the
 * tooltip), and the amount with the reference on the right. The whole row opens the booking.
 */
export function DayBookingCard({ stay, selected, onOpen }: DayBookingCardProps): React.JSX.Element {
  const status = stayStatusStyle(stay);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const guests = stay.guestCount;
  const details = [
    stay.houseName,
    stay.propertyName,
    `${formatShortDate(stay.checkIn)} → ${formatShortDate(stay.checkOut)}`,
    `${String(nights)} ${nights === 1 ? 'night' : 'nights'}`,
    `${String(guests)} ${guests === 1 ? 'guest' : 'guests'}`,
  ].join(' · ');
  const fullDetails = `${stay.houseName} · ${stay.propertyName} · ${formatIsoDate(stay.checkIn)} → ${formatIsoDate(stay.checkOut)} · ${String(nights)} ${nights === 1 ? 'night' : 'nights'} · ${String(guests)} ${guests === 1 ? 'guest' : 'guests'}`;
  return (
    <Box
      component="button"
      type="button"
      title={fullDetails}
      aria-label={`Open booking of ${stay.bookerName}`}
      aria-pressed={selected}
      onClick={(): void => onOpen(stay.id)}
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1,
        minHeight: 56,
        textAlign: 'left',
        font: 'inherit',
        color: 'text.primary',
        cursor: 'pointer',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        borderLeft: 3,
        borderLeftColor: status.tone === 'default' ? 'text.disabled' : `${status.tone}.main`,
        borderRadius: 1,
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
    >
      <UserAvatar name={stay.bookerName} size={30} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {stay.bookerName}
          </Typography>
          <StatusChip status={status} />
          {stay.kind === 'reservation' && stay.status === 'confirmed' ? <PaymentStatusChip stay={stay} /> : null}
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ whiteSpace: { xs: 'normal', sm: 'nowrap' }, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {details}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0, maxWidth: { xs: '34%', sm: 'none' } }}>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {formatCents(stay.totalCents, stay.currencyCode)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', lineHeight: 1.3, display: 'block', overflowWrap: 'anywhere' }}>
          {stay.reference}
        </Typography>
      </Box>
    </Box>
  );
}
