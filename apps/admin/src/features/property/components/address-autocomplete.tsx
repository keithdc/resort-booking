/**
 * @file apps/admin/src/features/property/components/address-autocomplete.tsx
 * @feature property
 * @dependencies staff geocode (Photon via Nest)
 */

'use client';

import type { GeocodeHit } from '@resort-booking/shared-types';
import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { searchStaffAddresses } from '../services/staff-property-api';

interface AddressAutocompleteProps {
  value: string;
  onInputChange: (value: string) => void;
  onSelect: (hit: GeocodeHit) => void;
}

/**
 * One street field: pick a result and the map pin follows.
 */
export function AddressAutocomplete({
  value,
  onInputChange,
  onSelect,
}: AddressAutocompleteProps): React.JSX.Element {
  const [options, setOptions] = useState<GeocodeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [debounced, setDebounced] = useState(value);

  useEffect((): (() => void) => {
    const timer = window.setTimeout((): void => {
      setDebounced(value);
    }, 280);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect((): (() => void) | undefined => {
    if (debounced.trim().length < 3) {
      setOptions([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setOptions([]);
    void searchStaffAddresses(debounced.trim())
      .then((hits): void => {
        if (!cancelled) {
          setOptions(hits);
        }
      })
      .catch((): void => {
        if (!cancelled) {
          setOptions([]);
        }
      })
      .finally((): void => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <Autocomplete
      options={options}
      filterOptions={(hits): GeocodeHit[] => hits}
      getOptionLabel={(option): string => (typeof option === 'string' ? option : option.label)}
      isOptionEqualToValue={(option, selected): boolean =>
        option.latitude === selected.latitude && option.longitude === selected.longitude
      }
      inputValue={value}
      onInputChange={(_event, next, reason): void => {
        if (reason === 'input' || reason === 'clear') {
          onInputChange(next);
        }
      }}
      onChange={(_event, option): void => {
        if (option !== null) {
          onSelect(option);
        }
      }}
      loading={loading}
      autoHighlight
      includeInputInList
      renderInput={(params): React.JSX.Element => (
        <TextField
          {...params}
          label="Street and number"
          required
          helperText="Start typing, then pick the matching street. The map jumps to that pin."
        />
      )}
    />
  );
}
