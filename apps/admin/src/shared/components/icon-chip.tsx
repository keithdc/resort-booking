/**
 * @file apps/admin/src/shared/components/icon-chip.tsx
 * @shared A tinted square holding an icon (decorative: the words next to it carry the meaning)
 * @dependencies MUI
 */

'use client';

import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import type { AvatarTone } from '@/shared/utils/avatar-color';

const PHONE_SCALE = 0.78;

interface IconChipProps {
  icon: ReactNode;
  tone?: AvatarTone;
  /** Edge length in px. */
  size?: number;
}

/**
 * Colour-coded icon tile used in page headers, section headers and KPI cards. Hidden from screen
 * readers: it only decorates a label that is already there.
 */
export function IconChip({ icon, tone = 'primary', size = 40 }: IconChipProps): React.JSX.Element {
  return (
    <Box
      aria-hidden
      sx={{
        // Phone: about three quarters of the desktop size (a 44px header chip becomes 33px).
        width: { xs: Math.round(size * PHONE_SCALE), sm: size },
        height: { xs: Math.round(size * PHONE_SCALE), sm: size },
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 2,
        bgcolor: (theme): string => alpha(theme.palette[tone].main, 0.14),
        color: `${tone}.dark`,
        '& svg': { fontSize: { xs: Math.round(size * PHONE_SCALE * 0.55), sm: size * 0.55 } },
      }}
    >
      {icon}
    </Box>
  );
}
