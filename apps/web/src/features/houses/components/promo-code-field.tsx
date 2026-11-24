/**
 * @file apps/web/src/features/houses/components/promo-code-field.tsx
 * @feature houses
 * @dependencies none — shows the API's verdict on the code; no discount math
 */

'use client';

import type { PromoCodeResult } from '@resort-booking/shared-types';
import { Button, Stack, TextField } from '@mui/material';

interface PromoCodeFieldProps {
  /** What the guest has typed. */
  value: string;
  onChange: (value: string) => void;
  /** The code the quote was last priced with ("" when none). */
  appliedCode: string;
  /** The API's verdict on the applied code, from the quote. Null when none was sent. */
  result: PromoCodeResult | null;
  onApply: () => void;
  onRemove: () => void;
  disabled?: boolean;
}

/**
 * Promo code with an explicit Apply, so typing never fires a request per keystroke
 * (the API rate-limits code attempts). A wrong code only shows a message; it never blocks booking.
 */
export function PromoCodeField({
  value,
  onChange,
  appliedCode,
  result,
  onApply,
  onRemove,
  disabled = false,
}: PromoCodeFieldProps): React.JSX.Element {
  const hasApplied = appliedCode !== '';
  const unchanged = value.trim() === appliedCode;
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <TextField
        label="Promo code (optional)"
        value={value}
        disabled={disabled}
        fullWidth
        onChange={(event): void => onChange(event.target.value)}
        onKeyDown={(event): void => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (value.trim() !== '' && !unchanged) {
              onApply();
            }
          }
        }}
        error={result !== null && !result.applied}
        helperText={result !== null && hasApplied ? result.message : undefined}
        slotProps={{ htmlInput: { maxLength: 40, autoCapitalize: 'characters' } }}
      />
      {hasApplied ? (
        <Button sx={{ height: 56, flexShrink: 0 }} onClick={onRemove} disabled={disabled}>
          Remove
        </Button>
      ) : null}
      <Button
        variant="outlined"
        sx={{ height: 56, flexShrink: 0 }}
        disabled={disabled || value.trim() === '' || unchanged}
        onClick={onApply}
      >
        Apply
      </Button>
    </Stack>
  );
}
