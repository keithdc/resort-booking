/**
 * @file apps/web/src/shared/components/cancellation-policy.tsx
 * @shared Guest-facing cancellation and date-change terms
 * @dependencies cancellation-policy utils — words what the API returned
 */

import type { CancellationPolicy } from '@resort-booking/shared-types';
import { Box, Typography } from '@mui/material';
import { describeRebooking, describeRefundRows } from '../utils/cancellation-policy';

interface CancellationPolicySectionProps {
  /** The API's policy, or null when it could not be loaded. */
  policy: CancellationPolicy | null;
  currencyCode: string;
}

/**
 * "Cancellation and changes": the refund ladder, whether dates can be changed (and the fee), what
 * happens if the property cancels, and that the 14-day withdrawal right does not apply. Shown
 * before the guest books so there are no surprises. Legal wording needs a lawyer's sign-off.
 */
export function CancellationPolicySection({ policy, currencyCode }: CancellationPolicySectionProps): React.JSX.Element {
  if (policy === null) {
    return (
      <Box component="section" id="cancellation-policy" aria-label="Cancellation and changes" sx={{ mb: 3, scrollMarginTop: 96 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Cancellation and changes
        </Typography>
        <Typography color="text.secondary">
          The cancellation terms could not be loaded right now. Please contact the property before booking.
        </Typography>
      </Box>
    );
  }
  const rows = describeRefundRows(policy.tiers);
  return (
    <Box component="section" id="cancellation-policy" aria-label="Cancellation and changes" sx={{ mb: 3, scrollMarginTop: 96 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Cancellation and changes
      </Typography>
      {rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          The refund terms for this property have not been published yet. Please contact the property before booking.
        </Typography>
      ) : (
        <>
          <Typography sx={{ mb: 0.5 }}>If you cancel, you get back:</Typography>
          <Box component="ul" aria-label="Refund by cancellation date" sx={{ mt: 0, mb: 1.5, pl: 3 }}>
            {rows.map((row): React.JSX.Element => (
              <li key={row.when}>
                <Typography component="span">{row.when}: </Typography>
                <Typography component="span" sx={{ fontWeight: 600 }}>
                  {row.refund}
                </Typography>
              </li>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Days are counted before check-in at 00:00, property local time.
          </Typography>
        </>
      )}
      <Typography sx={{ mb: 1 }}>{describeRebooking(policy, currencyCode)}</Typography>
      <Typography sx={{ mb: 1 }}>If the property has to cancel, you get 100% of what you paid back.</Typography>
      <Typography variant="body2" color="text.secondary">
        You have no 14-day right of withdrawal because this is a booking for specific dates.
      </Typography>
    </Box>
  );
}
