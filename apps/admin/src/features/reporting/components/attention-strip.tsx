/**
 * @file apps/admin/src/features/reporting/components/attention-strip.tsx
 * @feature reporting
 * @dependencies attention-items
 */

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import HourglassTopOutlinedIcon from '@mui/icons-material/HourglassTopOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import { Box, Link as MuiLink, Paper, Stack, Typography } from '@mui/material';
import type { ReportAttention } from '@resort-booking/shared-types';
import NextLink from 'next/link';
import type { ReactElement } from 'react';
import { IconChip } from '@/shared/components/icon-chip';
import type { AvatarTone } from '@/shared/utils/avatar-color';
import { buildAttentionItems, type AttentionItem } from '../utils/attention-items';
import { EMPTY_STATES, type ReportTabKey } from '../utils/metric-definitions';
import { MetricInfo } from './metric-info';
import { useMoneyHidden } from './money-visibility';
import { ReportSection } from './report-section';

/** Phone: the whole line is at least 44px tall to tap. */
const LINK_SX = { fontWeight: 600, textAlign: 'left', display: 'inline-flex', alignItems: 'center', minHeight: { xs: 44, md: 'auto' } } as const;

interface AttentionStripProps {
  attention: ReportAttention;
  currencyCode: string;
  onOpenTab: (tab: ReportTabKey) => void;
}

const ITEM_LOOK: Record<AttentionItem['key'], { tone: AvatarTone; icon: ReactElement }> = {
  unpaidHolds: { tone: 'warning', icon: <HourglassTopOutlinedIcon /> },
  refundsToPay: { tone: 'secondary', icon: <ReplayOutlinedIcon /> },
  arrivalsToday: { tone: 'info', icon: <LoginOutlinedIcon /> },
  arrivalsNext7Days: { tone: 'primary', icon: <EventOutlinedIcon /> },
};

/**
 * What needs a person today. Each item opens the page or tab where it is dealt with; with nothing to
 * do the strip says so.
 */
export function AttentionStrip({ attention, currencyCode, onOpenTab }: AttentionStripProps): React.JSX.Element {
  const items = buildAttentionItems(attention, currencyCode, useMoneyHidden());
  return (
    <ReportSection section="attention" level={2}>
      {items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 }}>
          <CheckCircleOutlineIcon color="success" aria-hidden />
          <Typography>{EMPTY_STATES.nothingNeedsAttention}</Typography>
        </Paper>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
          {items.map((item: AttentionItem): React.JSX.Element => (
            <Paper key={item.key} component="li" variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: 'warning.main', borderWidth: 1.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <IconChip icon={ITEM_LOOK[item.key].icon} tone={ITEM_LOOK[item.key].tone} size={36} />
                <Box sx={{ minWidth: 0 }}>
              {item.href !== null ? (
                <MuiLink component={NextLink} href={item.href} underline="hover" sx={LINK_SX}>
                  {item.text}
                </MuiLink>
              ) : (
                <MuiLink
                  component="button"
                  type="button"
                  underline="hover"
                  sx={LINK_SX}
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
                </Box>
              </Stack>
            </Paper>
          ))}
        </Box>
      )}
    </ReportSection>
  );
}
