/**
 * @file apps/admin/src/features/reservations/components/new-booking-promotions.tsx
 * @feature reservations
 * @dependencies discount-draft helpers (property feature), MUI
 */

'use client';

import type { Discount } from '@resort-booking/shared-types';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { discountStatus, summarizeConditions, summarizeEffect, summarizeUses } from '@/features/property/utils/discount-draft';

interface NewBookingPromotionsProps {
  promotions: readonly Discount[];
  currencyCode: string;
  /** Today's calendar date (YYYY-MM-DD), for each promotion's status. */
  today: string;
  /** The code now applied to the price ("" when none). */
  appliedCode: string;
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
 * The property's promotions that fit the chosen stay, so staff can see what exists and pick a coupon in one click,
 * with how many times each has been used. A coupon can be tried whether or not it is advertised to guests. Switched-off
 * and ended promotions are left out: they cannot apply.
 */
export function NewBookingPromotions({ promotions, currencyCode, today, appliedCode, onPick }: NewBookingPromotionsProps): React.JSX.Element | null {
  const rows = promotions.filter((discount): boolean => {
    const kind = discountStatus(discount, today).kind;
    return kind !== 'off' && kind !== 'ended';
  });
  if (rows.length === 0) {
    return null;
  }
  return (
    <Box component="section" aria-label="Promotions for this stay">
      <Typography variant="subtitle2" component="h3" sx={{ pb: 0.5 }}>
        Promotions for this stay
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
        {rows.map((discount): React.JSX.Element => {
          const code = couponCode(discount);
          const status = discountStatus(discount, today);
          const isApplied = code !== null && appliedCode.toLowerCase() === code.toLowerCase();
          return (
            <Box
              component="li"
              key={discount.id}
              sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.25, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Stack spacing={0.25} sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{discount.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {summarizeEffect(discount.effect, currencyCode)} off · {summarizeConditions(discount)}
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                  <Chip size="small" label={status.label} color={status.kind === 'live' ? 'success' : 'default'} variant="outlined" />
                  <Typography variant="caption" color="text.secondary">
                    {summarizeUses(discount.redemptions, discount.maxRedemptions)}
                  </Typography>
                  {code !== null ? (
                    <Typography variant="caption" color="text.secondary">
                      · {discount.promoted ? 'Advertised to guests' : 'Not advertised'}
                    </Typography>
                  ) : null}
                </Stack>
              </Stack>
              {code !== null ? (
                <Button
                  size="small"
                  variant={isApplied ? 'contained' : 'outlined'}
                  disabled={isApplied || status.kind === 'used_up'}
                  onClick={(): void => onPick(code)}
                  aria-label={isApplied ? `${code} is applied` : `Use code ${code}`}
                >
                  {isApplied ? 'Applied' : `Use ${code}`}
                </Button>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Applies by itself
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
