/**
 * @file apps/web/src/shared/components/stay-date-field.tsx
 * @shared On-demand check-in date picker for pages
 * @dependencies stay-date-picker (loaded lazily), date-display
 */

'use client';

import { TextField } from '@mui/material';
import { lazy, Suspense } from 'react';
import { formatDateForField } from '../utils/date-display';
import type { StayDatePickerProps } from './stay-date-picker';

// The date picker and its date library are sizeable. Loading them on demand keeps them out of the
// first download of every page; the placeholder below holds the space so nothing jumps.
const StayDatePickerImpl = lazy(() =>
  import('./stay-date-picker').then((module) => ({ default: module.StayDatePicker })),
);

/**
 * The check-in field pages use. Shows the chosen date in a placeholder while the real picker loads.
 */
export function StayDateField(props: StayDatePickerProps): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <TextField
          label={props.label}
          value={formatDateForField(props.value)}
          disabled
          fullWidth
          required
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 190, '& .MuiInputBase-root': { height: 56 } }}
        />
      }
    >
      <StayDatePickerImpl {...props} />
    </Suspense>
  );
}
