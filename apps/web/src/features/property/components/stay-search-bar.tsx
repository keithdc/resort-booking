/**
 * @file apps/web/src/features/property/components/stay-search-bar.tsx
 * @feature property
 * @dependencies stay-query — UX only; availability is Nest
 */

'use client';

import { Box, Stack, TextField, Typography } from '@mui/material';
import { BorderBeam, ShimmerButton } from '@resort-booking/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { StayDateField } from '@/shared/components/stay-date-field';
import { usePropertyUnavailable } from '@/shared/hooks/use-availability';
import { addDaysIsoDate, clampStayNights, todayIsoDate } from '@/shared/utils/today-iso';
import { propertyAvailabilityHref } from '../utils/property-stay-search';
import { searchHref, withDefaultStay, type StayQuery } from '@/shared/utils/stay-query';

interface StaySearchBarProps {
  initial: StayQuery;
  /**
   * "search" (default) sends the guest to the search page. "property" checks availability in
   * place: it names the property and reloads the same property page with the dates in the URL.
   */
  variant?: 'search' | 'property';
  /** Shown in the heading of the "property" variant. */
  propertyName?: string;
}

const FIELD_SX = {
  '& .MuiInputBase-root': { height: 56 },
};

/**
 * Check-in + nights + guests. Checkout is derived so guests do not pick two dates.
 */
export function StaySearchBar({
  initial,
  variant = 'search',
  propertyName = '',
}: StaySearchBarProps): React.JSX.Element {
  const router = useRouter();
  const headingId = useId();
  const todayIso = todayIsoDate();
  const [query, setQuery] = useState<StayQuery>(() => withDefaultStay(initial));
  // One resort: disable nights when every house is taken. All resorts: nothing to disable.
  const availability = usePropertyUnavailable(query.propertySlug === '' ? null : query.propertySlug);

  const submit = (): void => {
    if (query.checkIn === '' || query.checkOut === '') {
      return;
    }
    const inPlace = variant === 'property' && query.propertySlug !== '';
    router.push(inPlace ? propertyAvailabilityHref(query.propertySlug, query) : searchHref(query));
  };
  const contextual = variant === 'property';


  return (
    <BorderBeam>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        {contextual ? (
          <Typography id={headingId} variant="h6" component="h2" sx={{ mb: 1.5 }}>
            {`Check availability at ${propertyName}`}
          </Typography>
        ) : null}
        <Stack
          component="form"
          aria-labelledby={contextual ? headingId : undefined}
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', md: 'center' }}
          onSubmit={(event): void => {
            event.preventDefault();
            submit();
          }}
        >
          <StayDateField
            label="Check-in"
            value={query.checkIn}
            unavailable={availability.unavailable}
            todayIso={todayIso}
            onOpen={availability.refresh}
            onChange={(checkIn): void => {
              const nights = clampStayNights(Number.parseInt(query.nights, 10));
              setQuery((current): StayQuery => ({
                ...current,
                checkIn,
                nights: String(nights),
                checkOut: addDaysIsoDate(checkIn, nights),
              }));
            }}
          />
          {/* Phones: Nights and Guests share a row. From md this wrapper disappears (display: contents). */}
          <Box
            sx={{
              display: { xs: 'grid', md: 'contents' },
              gridTemplateColumns: '1fr 1fr',
              gap: 1.5,
            }}
          >
            <TextField
              label="Nights"
              type="number"
              fullWidth
              value={query.nights}
              onChange={(event): void => {
                const nights = clampStayNights(Number.parseInt(event.target.value, 10));
                setQuery((current): StayQuery => ({
                  ...current,
                  nights: String(nights),
                  checkOut: addDaysIsoDate(current.checkIn, nights),
                }));
              }}
              sx={FIELD_SX}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: 1, max: 30, inputMode: 'numeric' },
              }}
              required
            />
            <TextField
              label="Guests"
              type="number"
              fullWidth
              value={query.guestCount}
              onChange={(event): void => {
                setQuery((current): StayQuery => ({ ...current, guestCount: event.target.value }));
              }}
              sx={FIELD_SX}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: 1, max: 50, inputMode: 'numeric' },
              }}
              required
            />
          </Box>
          <ShimmerButton
            type="submit"
            sx={{
              minWidth: { md: 128 },
              height: 56,
              flexShrink: 0,
            }}
          >
            {contextual ? 'Check availability' : 'Search'}
          </ShimmerButton>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Leave on {query.checkOut}. Check-in is today unless you change it. Nights start at 1.
        </Typography>
      </Box>
    </BorderBeam>
  );
}
