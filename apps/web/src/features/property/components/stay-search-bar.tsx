/**
 * @file apps/web/src/features/property/components/stay-search-bar.tsx
 * @feature property
 * @dependencies stay-query — UX only; availability is Nest
 */

'use client';

import { Box, Stack, TextField, Typography } from '@mui/material';
import { BorderBeam, ShimmerButton } from '@resort-booking/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDaysIsoDate, clampStayNights, todayIsoDate } from '@/shared/utils/today-iso';
import { searchHref, withDefaultStay, type StayQuery } from '@/shared/utils/stay-query';

interface StaySearchBarProps {
  initial: StayQuery;
}

const FIELD_SX = {
  '& .MuiInputBase-root': { height: 56 },
};

/**
 * Check-in + nights + guests. Checkout is derived so guests do not pick two dates.
 */
export function StaySearchBar({ initial }: StaySearchBarProps): React.JSX.Element {
  const router = useRouter();
  const minDate = todayIsoDate();
  const [query, setQuery] = useState<StayQuery>(() => withDefaultStay(initial));

  const submit = (): void => {
    if (query.checkIn === '' || query.checkOut === '') {
      return;
    }
    router.push(searchHref(query));
  };

  return (
    <BorderBeam>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack
          component="form"
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', md: 'center' }}
          onSubmit={(event): void => {
            event.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Check-in"
            type="date"
            fullWidth
            value={query.checkIn}
            onChange={(event): void => {
              const checkIn = event.target.value;
              const nights = clampStayNights(Number.parseInt(query.nights, 10));
              setQuery((current): StayQuery => ({
                ...current,
                checkIn,
                nights: String(nights),
                checkOut: addDaysIsoDate(checkIn, nights),
              }));
            }}
            sx={FIELD_SX}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { min: minDate },
            }}
            required
          />
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
              htmlInput: { min: 1, max: 30 },
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
              htmlInput: { min: 1, max: 50 },
            }}
            required
          />
          <ShimmerButton
            type="submit"
            sx={{
              minWidth: { md: 128 },
              height: 56,
              flexShrink: 0,
            }}
          >
            Search
          </ShimmerButton>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Leave on {query.checkOut}. Check-in is today unless you change it. Nights start at 1.
        </Typography>
      </Box>
    </BorderBeam>
  );
}
