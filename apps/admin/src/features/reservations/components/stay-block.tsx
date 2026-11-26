/**
 * @file apps/admin/src/features/reservations/components/stay-block.tsx
 * @feature reservations
 * @dependencies MUI
 */

import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { IconChip } from '@/shared/components/icon-chip';
import type { AvatarTone } from '@/shared/utils/avatar-color';

interface StayBlockProps {
  title: string;
  icon?: ReactNode;
  tone?: AvatarTone;
  children: ReactNode;
}

/**
 * A titled card inside the booking dialog: tinted icon and title on a header strip, facts below.
 */
export function StayBlock({ title, icon, tone = 'primary', children }: StayBlockProps): React.JSX.Element {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden', minWidth: 0 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
        {icon !== undefined ? <IconChip icon={icon} tone={tone} size={32} /> : null}
        <Typography variant="subtitle2">{title}</Typography>
      </Stack>
      <Stack spacing={1.5} sx={{ p: 2 }}>
        {children}
      </Stack>
    </Box>
  );
}

interface StayFactProps {
  label: string;
  value: string;
}

/**
 * A small label with its value underneath.
 */
export function StayFact({ label, value }: StayFactProps): React.JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography>{value}</Typography>
    </Box>
  );
}
