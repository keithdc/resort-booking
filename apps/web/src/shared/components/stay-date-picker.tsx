/**
 * @file apps/web/src/shared/components/stay-date-picker.tsx
 * @shared Guest check-in picker that disables past and booked days
 * @dependencies @mui/x-date-pickers, dayjs, disabled-dates
 */

'use client';

import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';
import type { DateRange } from '@resort-booking/shared-types';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { isCheckInDisabled } from '../utils/disabled-dates';

const ISO_FORMAT = 'YYYY-MM-DD';

interface StayDatePickerProps {
  label: string;
  /** YYYY-MM-DD, or empty when nothing is chosen. */
  value: string;
  /** Called with YYYY-MM-DD, or empty when the guest clears the field. */
  onChange: (isoDate: string) => void;
  /** Ranges from the availability API. Their end day stays pickable. */
  unavailable: readonly DateRange[];
  /** Property-local today as YYYY-MM-DD. Earlier days are disabled. */
  todayIso: string;
  /** Fires when the calendar opens so the caller can refetch booked dates. */
  onOpen?: () => void;
}

/**
 * Check-in date field. The API supplies the booked ranges; Nest still validates every quote.
 */
export function StayDatePicker({
  label,
  value,
  onChange,
  unavailable,
  todayIso,
  onOpen,
}: StayDatePickerProps): React.JSX.Element {
  // Stable object per date string. A new Dayjs on every render (the checkout form ticks each
  // second) makes the open calendar snap back to the selected month.
  const selected = useMemo((): Dayjs | null => (value === '' ? null : dayjs(value)), [value]);
  const minDate = useMemo((): Dayjs => dayjs(todayIso), [todayIso]);
  return (
    <DesktopDatePicker
      label={label}
      value={selected}
      format="DD/MM/YYYY"
      minDate={minDate}
      shouldDisableDate={(day: Dayjs): boolean =>
        isCheckInDisabled(unavailable, day.format(ISO_FORMAT), todayIso)
      }
      onChange={(next: Dayjs | null): void => {
        if (next === null) {
          onChange('');
          return;
        }
        // Typing a partial date yields an invalid value; wait for a complete one.
        if (next.isValid()) {
          onChange(next.format(ISO_FORMAT));
        }
      }}
      {...(onOpen === undefined ? {} : { onOpen })}
      slotProps={{
        textField: {
          fullWidth: true,
          required: true,
          // Wide enough for DD/MM/YYYY plus the calendar icon; narrower clips the day.
          sx: { minWidth: 190, '& .MuiInputBase-root': { height: 56 } },
        },
        field: { clearable: true },
      }}
    />
  );
}
