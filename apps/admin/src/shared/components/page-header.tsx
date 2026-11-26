/**
 * @file apps/admin/src/shared/components/page-header.tsx
 * @shared The same header on every admin page: icon, title, one line of help, actions
 * @dependencies MUI, icon-chip
 */

'use client';

import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { AvatarTone } from '@/shared/utils/avatar-color';
import { IconChip } from './icon-chip';

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  description?: string;
  tone?: AvatarTone;
  /** Chips or labels shown right after the title (e.g. "On the website"). */
  badges?: ReactNode;
  /** Primary action(s), shown on the right on wide screens. */
  actions?: ReactNode;
}

/**
 * Page title block. The title is the page's only h1.
 */
export function PageHeader({ icon, title, description, tone = 'primary', badges, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <Box
      component="header"
      data-print="hide"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
        mb: 3,
      }}
    >
      <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ minWidth: 0 }}>
        <IconChip icon={icon} tone={tone} size={44} />
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.75rem', sm: undefined }, overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            {badges}
          </Stack>
          {description !== undefined ? (
            <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 680 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      {actions !== undefined ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0, '& > button, & > a': { flex: { xs: '1 1 auto', sm: '0 0 auto' } } }}>
          {actions}
        </Stack>
      ) : null}
    </Box>
  );
}
