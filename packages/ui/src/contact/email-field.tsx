/**
 * @file packages/ui/src/contact/email-field.tsx
 * @shared Email input with validation, for guest and admin forms
 * @dependencies @mui/material, contact-validation
 */

'use client';

import { TextField } from '@mui/material';
import { useState } from 'react';
import { emailError } from './contact-validation';

export interface EmailFieldProps {
  label: string;
  value: string;
  onChange: (email: string) => void;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Shown under the field when there is no validation error. */
  helperText?: string;
  autoComplete?: string;
}

/**
 * Email input. A malformed address shows a message once the field has been left, so nobody is
 * scolded mid-typing. The value is passed through as typed; callers trim on submit.
 */
export function EmailField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  fullWidth = true,
  helperText,
  autoComplete = 'email',
}: EmailFieldProps): React.JSX.Element {
  const [touched, setTouched] = useState(false);
  const message = touched ? emailError(value, required) : null;
  return (
    <TextField
      label={label}
      type="email"
      value={value}
      required={required}
      disabled={disabled}
      fullWidth={fullWidth}
      error={message !== null}
      helperText={message ?? helperText}
      onChange={(event): void => onChange(event.target.value)}
      onBlur={(): void => setTouched(true)}
      slotProps={{ htmlInput: { autoComplete, inputMode: 'email' } }}
    />
  );
}
