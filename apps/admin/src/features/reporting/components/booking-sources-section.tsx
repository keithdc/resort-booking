/**
 * @file apps/admin/src/features/reporting/components/booking-sources-section.tsx
 * @feature reporting
 * @dependencies booking-source, StaffReport
 */

import { Box, Typography } from '@mui/material';
import type { BookingSourceSlice, StaffReport } from '@resort-booking/shared-types';
import { bookingSourceLabel, isChannelSource } from '@/shared/utils/booking-source';
import { formatCents } from '@/shared/utils/money';
import { useMoneyHidden } from './money-visibility';
import { EmptyNote, ReportSection } from './report-section';

interface BookingSourcesSectionProps {
  report: StaffReport;
}

/**
 * Where the confirmed bookings of the period came from: one bar per source with its bookings, nights, money (for people
 * who see money) and share. One source only is still shown, simply. Without any booking there is a plain note.
 */
export function BookingSourcesSection({ report }: BookingSourcesSectionProps): React.JSX.Element {
  const moneyHidden = useMoneyHidden();
  const slices = report.bookingSources;
  return (
    <ReportSection section="bookingSources">
      {slices.length === 0 ? (
        <EmptyNote state="noBookings" />
      ) : (
        <Box component="ul" aria-label="Bookings by source" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, maxWidth: 640 }}>
          {slices.map((slice: BookingSourceSlice): React.JSX.Element => (
            <li key={slice.source}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600 }}>{bookingSourceLabel(slice.source)}</Typography>
                <Typography color="text.secondary">
                  {slice.reservationCount} {slice.reservationCount === 1 ? 'booking' : 'bookings'} · {slice.occupiedNights} {slice.occupiedNights === 1 ? 'night' : 'nights'}
                  {moneyHidden ? '' : ` · ${formatCents(slice.revenueCents, report.currencyCode)}`} · {slice.sharePercent}%
                </Typography>
              </Box>
              <Box aria-hidden sx={{ height: 10, borderRadius: 5, bgcolor: 'action.hover', overflow: 'hidden' }}>
                <Box sx={{ width: `${slice.sharePercent}%`, height: '100%', bgcolor: isChannelSource(slice.source) ? 'info.main' : 'primary.main' }} />
              </Box>
            </li>
          ))}
        </Box>
      )}
    </ReportSection>
  );
}
