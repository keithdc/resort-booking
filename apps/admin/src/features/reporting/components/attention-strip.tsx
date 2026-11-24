/**
 * @file apps/admin/src/features/reporting/components/attention-strip.tsx
 * @feature reporting
 * @dependencies attention-items
 */

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Box, Link as MuiLink, Paper, Typography } from '@mui/material';
import type { ReportAttention } from '@resort-booking/shared-types';
import NextLink from 'next/link';
import { buildAttentionItems, type AttentionItem } from '../utils/attention-items';
import { EMPTY_STATES, type ReportTabKey } from '../utils/metric-definitions';
import { MetricInfo } from './metric-info';
import { ReportSection } from './report-section';

interface AttentionStripProps {
  attention: ReportAttention;
  currencyCode: string;
  onOpenTab: (tab: ReportTabKey) => void;
}

/**
 * What needs a person today. Each item opens the page or tab where it is dealt with; with nothing to
 * do the strip says so.
 */
export function AttentionStrip({ attention, currencyCode, onOpenTab }: AttentionStripProps): React.JSX.Element {
  const items = buildAttentionItems(attention, currencyCode);
  return (
    <ReportSection section="attention" level={2}>
      {items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 }}>
          <CheckCircleOutlineIcon color="success" aria-hidden />
          <Typography>{EMPTY_STATES.nothingNeedsAttention}</Typography>
        </Paper>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
          {items.map((item: AttentionItem): React.JSX.Element => (
            <Paper key={item.key} component="li" variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: 'warning.main' }}>
              {item.href !== null ? (
                <MuiLink component={NextLink} href={item.href} underline="hover" sx={{ fontWeight: 600 }}>
                  {item.text}
                </MuiLink>
              ) : (
                <MuiLink
                  component="button"
                  type="button"
                  underline="hover"
                  sx={{ fontWeight: 600, textAlign: 'left' }}
                  onClick={(): void => {
                    if (item.tab !== null) {
                      onOpenTab(item.tab);
                    }
                  }}
                >
                  {item.text}
                </MuiLink>
              )}
              <MetricInfo metric={item.metric} />
              {item.detail !== null ? (
                <Typography variant="body2" color="text.secondary">
                  {item.detail}
                </Typography>
              ) : null}
            </Paper>
          ))}
        </Box>
      )}
    </ReportSection>
  );
}
