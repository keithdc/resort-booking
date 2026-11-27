/**
 * @file apps/admin/src/features/reservations/components/new-booking-promo-field.tsx
 * @feature reservations
 * @dependencies discount-draft helpers (property feature), MUI
 */

'use client';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Discount, PromoCodeResult } from '@resort-booking/shared-types';
import { Autocomplete, Box, Button, Collapse, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { discountStatus, summarizeConditions, summarizeEffect, summarizeUses } from '@/features/property/utils/discount-draft';

interface CouponOption {
  code: string;
  discount: Discount;
}

interface NewBookingPromoFieldProps {
  /** The property's promotions that fit the chosen stay (any state). */
  promotions: readonly Discount[];
  currencyCode: string;
  /** Today's calendar date (YYYY-MM-DD), for each promotion's status. */
  today: string;
  /** What has been typed. */
  value: string;
  /** The code the price was last worked out with ("" when none). */
  appliedCode: string;
  /** The API's answer for the applied code, from the quote. */
  result: PromoCodeResult | null;
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
  /** A coupon was picked from the list or typed and confirmed with Enter: apply it. */
  onPick: (code: string) => void;
}

function couponCode(discount: Discount): string | null {
  for (const condition of discount.conditions) {
    if (condition.kind === 'promo_code') {
      return condition.code;
    }
  }
  return null;
}

/**
 * One promo field for everything: type a code, or open the list to pick one of the property's coupons (with its size,
 * status and "0 of 1 used"). The list scrolls inside itself, so many promotions never make the form longer. The
 * automatic offers (no code) sit folded in one line under it. Promotions that are switched off, ended or used up are left out: they can no longer apply.
 */
export function NewBookingPromoField({
  promotions,
  currencyCode,
  today,
  value,
  appliedCode,
  result,
  onChange,
  onApply,
  onRemove,
  onPick,
}: NewBookingPromoFieldProps): React.JSX.Element {
  const [showAutomatic, setShowAutomatic] = useState(false);
  const usable = promotions.filter((discount): boolean => {
    const kind = discountStatus(discount, today).kind;
    return kind !== 'off' && kind !== 'ended' && kind !== 'used_up';
  });
  const coupons: CouponOption[] = [];
  const automatic: Discount[] = [];
  for (const discount of usable) {
    const code = couponCode(discount);
    if (code === null) {
      automatic.push(discount);
    } else {
      coupons.push({ code, discount });
    }
  }
  const available = coupons.length;
  const typed = value.trim();
  const hasApplied = appliedCode !== '';
  const showResult = hasApplied && result !== null;

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Autocomplete<CouponOption, false, false, true>
          freeSolo
          forcePopupIcon
          fullWidth
          options={coupons}
          inputValue={value}
          onInputChange={(_event, next, reason): void => {
            if (reason !== 'reset') {
              onChange(next);
            }
          }}
          onChange={(_event, picked): void => {
            if (picked === null) {
              return;
            }
            onPick(typeof picked === 'string' ? picked.trim() : picked.code);
          }}
          getOptionLabel={(option): string => (typeof option === 'string' ? option : option.code)}
          filterOptions={(options, state): CouponOption[] => {
            const needle = state.inputValue.trim().toLowerCase();
            return needle === '' || needle === appliedCode.toLowerCase()
              ? options
              : options.filter((option): boolean => option.code.toLowerCase().includes(needle) || option.discount.label.toLowerCase().includes(needle));
          }}
          noOptionsText="No matching coupon. Press Enter to try the code as typed."
          slotProps={{ listbox: { sx: { maxHeight: 240 } } }}
          renderOption={(props, option): React.JSX.Element => {
            const { key, ...rest } = props;
            const status = discountStatus(option.discount, today);
            return (
              <Box component="li" key={key} {...rest}>
                <Stack spacing={0} sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {option.code} · {option.discount.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {summarizeEffect(option.discount.effect, currencyCode)} off · {status.label} ·{' '}
                    {summarizeUses(option.discount.redemptions, option.discount.maxRedemptions)} ·{' '}
                    {option.discount.promoted ? 'Advertised to guests' : 'Not advertised'}
                  </Typography>
                </Stack>
              </Box>
            );
          }}
          renderInput={(params): React.JSX.Element => (
            <TextField
              id={params.id}
              disabled={params.disabled}
              fullWidth={params.fullWidth}
              size={params.size}
              label="Promo code (optional)"
              error={showResult && result.applied === false}
              helperText={
                showResult
                  ? result.message
                  : available > 0
                    ? `${String(available)} coupon${available === 1 ? '' : 's'} for this stay: open the list to pick one.`
                    : 'Only if the guest gave you a code.'
              }
              slotProps={{
                input: params.InputProps,
                inputLabel: params.InputLabelProps,
                htmlInput: { ...params.inputProps, maxLength: 40, autoCapitalize: 'characters', autoComplete: 'off', autoCorrect: 'off', spellCheck: false },
              }}
            />
          )}
        />
        {hasApplied ? (
          <Button sx={{ height: 56, flexShrink: 0 }} onClick={onRemove}>
            Remove
          </Button>
        ) : null}
        <Button variant="outlined" sx={{ height: 56, flexShrink: 0 }} disabled={typed === '' || typed === appliedCode} onClick={onApply}>
          Apply
        </Button>
      </Stack>
      {automatic.length > 0 ? (
        <Box>
          <Button
            size="small"
            color="inherit"
            onClick={(): void => setShowAutomatic((open) => !open)}
            aria-expanded={showAutomatic}
            endIcon={showAutomatic ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            sx={{ textTransform: 'none', color: 'text.secondary', px: 0.5 }}
          >
            {String(automatic.length)} automatic offer{automatic.length === 1 ? '' : 's'} (already in the price when they fit)
          </Button>
          <Collapse in={showAutomatic} unmountOnExit>
            <Box component="ul" aria-label="Automatic offers" sx={{ listStyle: 'none', m: 0, p: 0, pl: 0.5 }}>
              {automatic.map((discount): React.JSX.Element => (
                <Typography component="li" variant="caption" color="text.secondary" key={discount.id} sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {discount.label}: {summarizeEffect(discount.effect, currencyCode)} off · {summarizeConditions(discount)}
                </Typography>
              ))}
            </Box>
          </Collapse>
        </Box>
      ) : null}
    </Stack>
  );
}
