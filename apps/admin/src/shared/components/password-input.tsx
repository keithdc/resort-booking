/**
 * @file apps/admin/src/shared/components/password-input.tsx
 * @shared Password text field with a show/hide eye
 * @dependencies MUI
 */

'use client';

import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import { useState } from 'react';

export type PasswordInputProps = Omit<TextFieldProps, 'type' | 'variant'> & {
  /** Accessible name of the eye button. Give each field on one screen its own name. */
  toggleLabel?: string;
};

/**
 * A password field with an eye button to show or hide what was typed. The button is a toggle
 * (`aria-pressed`, one constant name) and stays reachable by keyboard.
 */
export function PasswordInput({ toggleLabel = 'Show password', slotProps, ...rest }: PasswordInputProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const inputSlot = typeof slotProps?.input === 'object' && slotProps.input !== null ? slotProps.input : {};
  return (
    <TextField
      {...rest}
      type={visible ? 'text' : 'password'}
      slotProps={{
        ...slotProps,
        input: {
          ...inputSlot,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                size="small"
                aria-label={toggleLabel}
                aria-pressed={visible}
                onClick={(): void => setVisible((current): boolean => !current)}
                onMouseDown={(event): void => event.preventDefault()}
              >
                {visible ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
