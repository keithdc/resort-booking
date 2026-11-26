/**
 * @file apps/admin/src/features/configuration/components/new-password-field.tsx
 * @feature configuration
 * @dependencies MUI, password-checklist
 */

'use client';

import { Box } from '@mui/material';
import { PasswordInput } from '@/shared/components/password-input';
import { PasswordChecklist } from './password-checklist';

interface NewPasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The account's sign-in email, for the "does not contain your email name" rule. */
  email: string;
}

/**
 * A new-password field with a show/hide toggle (a toggle button: `aria-pressed`, one constant name) and the
 * live rule checklist underneath.
 */
export function NewPasswordField({ label, value, onChange, email }: NewPasswordFieldProps): React.JSX.Element {
  return (
    <Box>
      <PasswordInput
        fullWidth
        label={label}
        value={value}
        onChange={(event): void => onChange(event.target.value)}
        autoComplete="new-password"
      />
      <PasswordChecklist password={value} email={email} />
    </Box>
  );
}
