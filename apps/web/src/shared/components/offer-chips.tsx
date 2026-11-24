/**
 * @file apps/web/src/shared/components/offer-chips.tsx
 * @shared The offers that apply to a stay, as a calm list of chips
 * @dependencies MUI, copy-code-button
 */

import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { Box, Chip } from '@mui/material';
import type { PromotedOffer } from '@resort-booking/shared-types';
import { CopyCodeButton } from './copy-code-button';

interface OfferChipsProps {
  offers: readonly PromotedOffer[];
  /**
   * Add a "Copy code" button to code offers. Leave off inside a link (a stay card): a button must
   * not sit inside an anchor.
   */
  copyable?: boolean;
}

/**
 * One chip per offer, using the headline the API wrote. Renders nothing when there are no offers.
 */
export function OfferChips({ offers, copyable = false }: OfferChipsProps): React.JSX.Element | null {
  if (offers.length === 0) {
    return null;
  }
  return (
    <Box
      component="ul"
      aria-label="Current offers"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, listStyle: 'none', m: 0, p: 0 }}
    >
      {offers.map((offer): React.JSX.Element => (
        <Box component="li" key={offer.id}>
          <Chip
            icon={<LocalOfferOutlinedIcon />}
            color="secondary"
            variant="outlined"
            label={
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                {offer.headline}
                {copyable && offer.promoCode !== null ? <CopyCodeButton code={offer.promoCode} /> : null}
              </Box>
            }
            sx={{ height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }}
          />
        </Box>
      ))}
    </Box>
  );
}
