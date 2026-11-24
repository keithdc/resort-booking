/**
 * @file apps/web/src/shared/components/cancellation-policy.tsx
 * @shared Guest-facing cancellation and date-change terms, scannable
 * @dependencies cancellation-policy utils — words what the API returned
 */

'use client';

import type { CancellationPolicy } from '@resort-booking/shared-types';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import {
  buildRefundSegments,
  describeRebooking,
  describeRefundHeadline,
  type RefundSegment,
} from '../utils/cancellation-policy';

const ANCHOR = 'cancellation-policy';

interface CancellationPolicySectionProps {
  /** The API's policy, or null when it could not be loaded. */
  policy: CancellationPolicy | null;
  currencyCode: string;
  /** Check-in as YYYY-MM-DD when the guest has chosen dates; turns "7 days before" into a date. */
  checkIn?: string | undefined;
}

/**
 * "Cancellation and changes": a one-line summary, the refund steps in order, and the full terms
 * folded below (how days are counted, changing dates and its fee, what happens if the property
 * cancels, and that the 14-day withdrawal right does not apply). Shown before the guest books so
 * there are no surprises. Legal wording needs a lawyer's sign-off.
 */
export function CancellationPolicySection({
  policy,
  currencyCode,
  checkIn,
}: CancellationPolicySectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  // The checkout tick-box links here. The withdrawal wording is in the fold, so open it.
  useEffect((): (() => void) => {
    const openOnHash = (): void => {
      if (window.location.hash === `#${ANCHOR}`) {
        setExpanded(true);
      }
    };
    openOnHash();
    window.addEventListener('hashchange', openOnHash);
    return (): void => window.removeEventListener('hashchange', openOnHash);
  }, []);

  if (policy === null) {
    return (
      <Box component="section" id={ANCHOR} aria-label="Cancellation and changes" sx={{ mb: 3, scrollMarginTop: 96 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Cancellation and changes
        </Typography>
        <Typography color="text.secondary">
          The cancellation terms could not be loaded right now. Please contact the property before booking.
        </Typography>
      </Box>
    );
  }
  const headline = describeRefundHeadline(policy.tiers, checkIn);
  const segments = buildRefundSegments(policy.tiers, checkIn);
  const hasDates = segments.some((segment): boolean => segment.window !== null);

  return (
    <Box component="section" id={ANCHOR} aria-label="Cancellation and changes" sx={{ mb: 3, scrollMarginTop: 96 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Cancellation and changes
      </Typography>
      {headline === null ? (
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          The refund terms for this property have not been published yet. Please contact the property before booking.
        </Typography>
      ) : (
        <>
          <Typography sx={{ fontWeight: 600, mb: 1.5 }}>{headline}</Typography>
          <Box
            component="ol"
            aria-label="Refund by cancellation date"
            sx={{
              listStyle: 'none',
              m: 0,
              mb: 1,
              p: 0,
              display: 'grid',
              gap: 1,
              gridTemplateColumns: { xs: '1fr', sm: `repeat(${Math.min(segments.length, 4)}, minmax(0, 1fr))` },
            }}
          >
            {segments.map((segment): React.JSX.Element => (
              <SegmentItem key={segment.key} segment={segment} />
            ))}
          </Box>
          {hasDates ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Deadlines are at 00:00, property local time.
            </Typography>
          ) : null}
        </>
      )}
      <Accordion
        disableGutters
        variant="outlined"
        expanded={expanded}
        onChange={(_event, next): void => setExpanded(next)}
        sx={{ mt: 1, borderRadius: 1, '&::before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls="cancellation-terms-content"
          id="cancellation-terms-header"
        >
          <Typography sx={{ fontWeight: 600 }}>Full cancellation terms</Typography>
        </AccordionSummary>
        <AccordionDetails id="cancellation-terms-content">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Days are counted before check-in at 00:00, property local time.
          </Typography>
          <Typography sx={{ mb: 1 }}>{describeRebooking(policy, currencyCode)}</Typography>
          <Typography sx={{ mb: 1 }}>If the property has to cancel, you get 100% of what you paid back.</Typography>
          <Typography variant="body2" color="text.secondary">
            You have no 14-day right of withdrawal because this is a booking for specific dates.
          </Typography>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

interface SegmentItemProps {
  segment: RefundSegment;
}

function SegmentItem({ segment }: SegmentItemProps): React.JSX.Element {
  return (
    <Box
      component="li"
      data-tone={segment.tone}
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: 1,
        borderColor: `${segment.tone}.main`,
        borderLeftWidth: 4,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {segment.period}
      </Typography>
      {segment.window !== null ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {segment.window}
        </Typography>
      ) : null}
      <Typography sx={{ fontWeight: 700, color: `${segment.tone}.dark` }}>{segment.refund}</Typography>
    </Box>
  );
}
