/**
 * @file apps/admin/src/features/configuration/components/new-password-field.tsx
 * @feature configuration
 * @dependencies MUI, password-checklist
 */

'use client';

import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, IconButton, InputAdornment, TextField } from '@mui/material';
import { useState } from 'react';
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
  const [visible, setVisible] = useState(false);
  return (
    <Box>
      <TextField
        fullWidth
        label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event): void => onChange(event.target.value)}
        autoComplete="new-password"
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  aria-label="Show password"
                  aria-pressed={visible}
                  onClick={(): void => setVisible((current): boolean => !current)}
                >
                  {visible ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <PasswordChecklist password={value} email={email} />
    </Box>
  );
}
