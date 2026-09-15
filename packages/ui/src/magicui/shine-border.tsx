/**
 * @file packages/ui/src/magicui/shine-border.tsx
 * @shared Magic UI Shine Border — https://magicui.design/docs/components/shine-border
 * @dependencies @mui/material
 */

'use client';

import { Box, keyframes } from '@mui/material';
import type { ReactNode } from 'react';

interface ShineBorderProps {
  children: ReactNode;
}

const shine = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`;

/**
 * Soft moving highlight around a card. Radius stays 8px.
 */
export function ShineBorder({ children }: ShineBorderProps): React.JSX.Element {
  return (
    <Box
      sx={{
        borderRadius: 1,
        p: '1px',
        background: 'linear-gradient(90deg, transparent, var(--mui-palette-secondary-main), transparent)',
        backgroundSize: '200% 100%',
        animation: `${shine} 4s linear infinite`,
      }}
    >
      <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'background.paper' }}>{children}</Box>
    </Box>
  );
}
