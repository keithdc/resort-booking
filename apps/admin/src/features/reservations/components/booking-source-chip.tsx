/**
 * @file apps/admin/src/features/reservations/components/booking-source-chip.tsx
 * @feature reservations
 * @dependencies booking-source, MUI (icon + words, never colour alone)
 */

import DirectionsWalkOutlinedIcon from '@mui/icons-material/DirectionsWalkOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import { Chip } from '@mui/material';
import type { BookingSource } from '@resort-booking/shared-types';
import { bookingSourceLabel, isChannelSource } from '@/shared/utils/booking-source';

interface BookingSourceChipProps {
  source: BookingSource;
}

function iconFor(source: BookingSource): React.JSX.Element {
  if (source === 'website') {
    return <LanguageOutlinedIcon />;
  }
  if (source === 'phone_email') {
    return <PhoneOutlinedIcon />;
  }
  if (source === 'walk_in') {
    return <DirectionsWalkOutlinedIcon />;
  }
  return <SwapHorizOutlinedIcon />;
}

/**
 * Where the booking came from: "Our website", "Airbnb", "Phone or email"... An icon and the words, small and quiet. A
 * booking from another site is marked with the swap arrows, because that site, not this app, holds its payment.
 */
export function BookingSourceChip({ source }: BookingSourceChipProps): React.JSX.Element {
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={iconFor(source)}
      label={bookingSourceLabel(source)}
      color={isChannelSource(source) ? 'info' : 'default'}
      aria-label={`Booked via ${bookingSourceLabel(source)}`}
    />
  );
}
