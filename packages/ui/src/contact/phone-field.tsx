/**
 * @file packages/ui/src/contact/phone-field.tsx
 * @shared Phone input with country flag + calling code, for guest and admin forms
 * @dependencies @mui/material, contact-validation
 */

'use client';

import { InputAdornment, MenuItem, Select, TextField } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  countryName,
  countryOptions,
  DEFAULT_PHONE_COUNTRY,
  flagEmoji,
  formatNational,
  isValidPhone,
  phoneError,
  splitE164,
  toE164,
  type CountryCode,
} from './contact-validation';

export interface PhoneFieldProps {
  label: string;
  /** International number in E.164 ("+33612345678"), or empty. The field always reports E.164. */
  value: string;
  onChange: (e164: string) => void;
  /** Country shown when the value is empty. */
  defaultCountry?: CountryCode;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Shown under the field when there is no validation error. */
  helperText?: string;
}

/**
 * Phone input with a flag and country calling code. The person types the national number
 * ("06 12 34 56 78"); the parent receives a clean E.164 value. Invalid numbers show a message
 * once the field has been left, so nobody is scolded mid-typing.
 */
export function PhoneField({
  label,
  value,
  onChange,
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  required = false,
  disabled = false,
  fullWidth = true,
  helperText,
}: PhoneFieldProps): React.JSX.Element {
  const options = useMemo(() => countryOptions(), []);
  const [initial] = useState(() => splitE164(value));
  const [country, setCountry] = useState<CountryCode>(initial?.country ?? defaultCountry);
  const [text, setText] = useState<string>(initial?.national ?? '');
  const [touched, setTouched] = useState(false);
  const lastEmitted = useRef<string>(value);

  // Re-sync when the parent changes the value (e.g. a saved form loads), but not for our own emits.
  useEffect((): void => {
    if (value === lastEmitted.current) {
      return;
    }
    lastEmitted.current = value;
    const next = splitE164(value);
    setText(next?.national ?? '');
    if (next?.country !== undefined) {
      setCountry(next.country);
    }
  }, [value]);

  const emit = (nextCountry: CountryCode, nextText: string): void => {
    const e164 = toE164(nextCountry, nextText);
    lastEmitted.current = e164;
    onChange(e164);
  };

  const handleText = (raw: string): void => {
    // A pasted international number ("+49 30 ...") selects its own country.
    if (raw.trim().startsWith('+')) {
      const pasted = splitE164(toE164(country, raw));
      if (pasted?.country !== undefined) {
        setCountry(pasted.country);
        setText(pasted.national);
        emit(pasted.country, pasted.national);
        return;
      }
    }
    const formatted = formatNational(country, raw);
    setText(formatted);
    emit(country, formatted);
  };

  const handleCountry = (next: CountryCode): void => {
    setCountry(next);
    const reformatted = formatNational(next, text);
    setText(reformatted);
    emit(next, reformatted);
  };

  const message = touched ? phoneError(value, required, countryName(country)) : null;
  const invalid = touched && value !== '' && !isValidPhone(value);

  return (
    <TextField
      label={label}
      type="tel"
      value={text}
      required={required}
      disabled={disabled}
      fullWidth={fullWidth}
      error={message !== null || invalid}
      helperText={message ?? helperText}
      onChange={(event): void => handleText(event.target.value)}
      onBlur={(): void => setTouched(true)}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { inputMode: 'tel', autoComplete: 'tel-national' },
        input: {
          startAdornment: (
            <InputAdornment position="start" sx={{ mr: 0.5 }}>
              <Select
                variant="standard"
                disableUnderline
                value={country}
                disabled={disabled}
                onChange={(event): void => {
                  const picked = options.find((option) => option.code === event.target.value);
                  if (picked !== undefined) {
                    handleCountry(picked.code);
                  }
                }}
                inputProps={{ 'aria-label': 'Country calling code' }}
                renderValue={(code): string => `${flagEmoji(code)} +${options.find((o) => o.code === code)?.callingCode ?? ''}`}
                MenuProps={{ slotProps: { paper: { sx: { maxHeight: 320 } } } }}
              >
                {options.map((option) => (
                  <MenuItem key={option.code} value={option.code}>
                    {option.flag} {option.name} +{option.callingCode}
                  </MenuItem>
                ))}
              </Select>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
