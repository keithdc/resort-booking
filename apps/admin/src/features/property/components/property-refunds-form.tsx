/**
 * @file apps/admin/src/features/property/components/property-refunds-form.tsx
 * @feature property
 * @dependencies staff-property-api — percents come from the API
 */

'use client';

import type { CancellationTierWrite, PropertyBookingConfig, RebookFeeType } from '@resort-booking/shared-types';
import {
  Alert,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { savePropertyBookingConfig } from '../services/staff-property-api';

interface PropertyRefundsFormProps {
  propertyId: string;
  initial: PropertyBookingConfig;
}

interface FormState {
  rebookable: boolean;
  rebookFeeType: RebookFeeType;
  rebookFeeValue: string;
  tiers: CancellationTierWrite[];
}

/** True when the ladder is the one starting row of a new property: a single catch-all, 0 days before check-in, 0% back. */
function isDefaultLadder(tiers: readonly CancellationTierWrite[]): boolean {
  const [only] = tiers;
  return tiers.length === 1 && only !== undefined && only.minDaysBeforeCheckIn === 0 && only.refundPercent === 0;
}

/**
 * Per-property refund ladder and rebook flags.
 */
export function PropertyRefundsForm({ propertyId, initial }: PropertyRefundsFormProps): React.JSX.Element {
  const [form, setForm] = useState<FormState>({
    rebookable: initial.rebookable,
    rebookFeeType: initial.rebookFeeType,
    rebookFeeValue: String(initial.rebookFeeValue),
    tiers: initial.tiers.map(
      (tier): CancellationTierWrite => ({
        minDaysBeforeCheckIn: tier.minDaysBeforeCheckIn,
        refundPercent: tier.refundPercent,
      }),
    ),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSave = async (): Promise<void> => {
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const result = await savePropertyBookingConfig(propertyId, {
        rebookable: form.rebookable,
        rebookFeeType: form.rebookFeeType,
        rebookFeeValue: Number.parseFloat(form.rebookFeeValue),
        tiers: form.tiers,
      });
      setForm({
        rebookable: result.config.rebookable,
        rebookFeeType: result.config.rebookFeeType,
        rebookFeeValue: String(result.config.rebookFeeValue),
        tiers: result.config.tiers.map(
          (tier): CancellationTierWrite => ({
            minDaysBeforeCheckIn: tier.minDaysBeforeCheckIn,
            refundPercent: tier.refundPercent,
          }),
        ),
      });
      if (result.invertedWarning) {
        setWarning('A farther-out tier refunds less than a closer one. Check that is intentional.');
      }
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save refunds');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={2} maxWidth={640}>
      <Typography color="text.secondary">
        If a guest cancels, this is how much money they get back. Closer to arrival usually means a smaller
        refund. This only applies to this property.
      </Typography>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {isDefaultLadder(form.tiers) ? (
        <Alert severity="info">
          This property starts with no refund when a guest cancels (0 days before check-in: 0%). Add tiers to give money back to
          guests who cancel earlier, then save.
        </Alert>
      ) : null}
      {warning !== null ? <Alert severity="warning">{warning}</Alert> : null}
      <FormControlLabel
        control={
          <Switch
            checked={form.rebookable}
            onChange={(event): void => {
              setForm((current): FormState => ({ ...current, rebookable: event.target.checked }));
            }}
          />
        }
        label="Guests can rebook dates on the same stay"
      />
      <FormControl>
        <InputLabel id="rebook-fee">Rebook fee</InputLabel>
        <Select
          labelId="rebook-fee"
          label="Rebook fee"
          value={form.rebookFeeType}
          onChange={(event): void => {
            const value = event.target.value;
            if (value !== 'none' && value !== 'fixed' && value !== 'percent') {
              return;
            }
            setForm((current): FormState => ({ ...current, rebookFeeType: value }));
          }}
        >
          <MenuItem value="none">None</MenuItem>
          <MenuItem value="fixed">Fixed (euros)</MenuItem>
          <MenuItem value="percent">Percent of the original booking</MenuItem>
        </Select>
      </FormControl>
      {form.rebookFeeType !== 'none' ? (
        <TextField
          label={form.rebookFeeType === 'fixed' ? 'Fee (euros)' : 'Fee percent'}
          value={form.rebookFeeValue}
          onChange={(event): void => {
            setForm((current): FormState => ({ ...current, rebookFeeValue: event.target.value }));
          }}
        />
      ) : null}
      {form.tiers.map((tier, index): React.JSX.Element => (
        <Stack key={`${tier.minDaysBeforeCheckIn}-${index}`} direction="row" spacing={2}>
          <TextField
            label="Days before check-in"
            type="number"
            value={tier.minDaysBeforeCheckIn}
            onChange={(event): void => {
              const next = Number.parseInt(event.target.value, 10);
              setForm((current): FormState => ({
                ...current,
                tiers: current.tiers.map((row, rowIndex): CancellationTierWrite =>
                  rowIndex === index ? { ...row, minDaysBeforeCheckIn: next } : row,
                ),
              }));
            }}
          />
          <TextField
            label="Refund %"
            type="number"
            value={tier.refundPercent}
            onChange={(event): void => {
              const next = Number.parseInt(event.target.value, 10);
              setForm((current): FormState => ({
                ...current,
                tiers: current.tiers.map((row, rowIndex): CancellationTierWrite =>
                  rowIndex === index ? { ...row, refundPercent: next } : row,
                ),
              }));
            }}
          />
          <Button
            onClick={(): void => {
              setForm((current): FormState => ({
                ...current,
                tiers: current.tiers.filter((_, rowIndex): boolean => rowIndex !== index),
              }));
            }}
          >
            Remove
          </Button>
        </Stack>
      ))}
      <Button
        variant="outlined"
        onClick={(): void => {
          setForm((current): FormState => ({
            ...current,
            tiers: [...current.tiers, { minDaysBeforeCheckIn: 0, refundPercent: 0 }],
          }));
        }}
      >
        Add tier
      </Button>
      <Button variant="contained" disabled={pending} onClick={(): void => void onSave()}>
        {pending ? 'Saving…' : 'Save cancellation rules'}
      </Button>
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          Refunds saved
        </Alert>
      </Snackbar>
    </Stack>
  );
}
