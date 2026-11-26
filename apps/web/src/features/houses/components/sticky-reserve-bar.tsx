/**
 * @file apps/web/src/features/houses/components/sticky-reserve-bar.tsx
 * @feature houses
 * @dependencies stay-quote-context, nightly-rate-label, money — shows the API's quote, no price math
 */

'use client';

import { Box, Button, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { formatCents } from '@/shared/utils/money';
import { scrollToElement } from '@/shared/utils/responsive';
import { useStayQuote } from '../context/stay-quote-context';
import { nightlyRateParts } from '../utils/nightly-rate-label';

/** The id of the booking panel the bar scrolls to. */
export const BOOKING_PANEL_ID = 'book';

interface StickyReserveBarProps {
  /** The stay's standard rate, shown until the guest's dates have a price. */
  standardRateCents: number;
  currencyCode: string;
}

/**
 * Phone-only bar pinned to the bottom of a stay page: the price (the quote for the chosen dates, or the
 * standard rate) and one button that scrolls to the booking panel. It steps aside while that panel is
 * on screen, so there is never a second Reserve button next to the real one. It clears the home bar
 * via the safe-area inset. Hidden from `md`, where the panel sits beside the page text.
 */
export function StickyReserveBar({ standardRateCents, currencyCode }: StickyReserveBarProps): React.JSX.Element {
  const quote = useStayQuote();
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect((): (() => void) => {
    const panel = document.getElementById(BOOKING_PANEL_ID);
    if (panel === null || typeof IntersectionObserver === 'undefined') {
      return (): void => undefined;
    }
    const observer = new IntersectionObserver((entries): void => {
      setPanelVisible(entries.some((entry): boolean => entry.isIntersecting));
    });
    observer.observe(panel);
    return (): void => observer.disconnect();
  }, []);

  const priced = quote !== null && quote.available;
  const rate = nightlyRateParts(quote, { nightlyRateCents: standardRateCents, currencyCode });
  const headline = priced
    ? formatCents(quote.totalCents, quote.currencyCode)
    : quote !== null
      ? 'Dates not available'
      : rate.rate;
  const detail = priced
    ? `${String(quote.nights)} night${quote.nights === 1 ? '' : 's'}${quote.discounts.length > 0 ? ' · offer applied' : ''}`
    : quote !== null
      ? 'Pick other dates below'
      : 'Add dates to see the total';

  return (
    <>
      {/* Keeps the end of the page (footer links) from hiding behind the fixed bar. */}
      <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, height: 'calc(72px + env(safe-area-inset-bottom))' }} />
      <Box
        component="aside"
        aria-label="Reserve this stay"
        data-hidden={panelVisible ? 'true' : 'false'}
        sx={{
          display: { xs: panelVisible ? 'none' : 'flex', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (theme): number => theme.zIndex.appBar,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 2,
          pt: 1.25,
          pb: 'calc(10px + env(safe-area-inset-bottom))',
          pl: 'max(16px, env(safe-area-inset-left))',
          pr: 'max(16px, env(safe-area-inset-right))',
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {headline}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {detail}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          sx={{ flexShrink: 0, minHeight: 48, px: 3 }}
          onClick={(): void => {
            scrollToElement(document.getElementById(BOOKING_PANEL_ID));
          }}
        >
          {quote === null ? 'Check dates' : 'Reserve'}
        </Button>
      </Box>
    </>
  );
}
