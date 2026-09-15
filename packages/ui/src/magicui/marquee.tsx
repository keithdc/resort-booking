/**
 * @file packages/ui/src/magicui/marquee.tsx
 * @shared Magic UI Marquee — https://magicui.design/docs/components/marquee
 * @dependencies @mui/material
 */

'use client';

import { Box, keyframes } from '@mui/material';
import type { ReactNode } from 'react';

interface MarqueeProps {
  children: ReactNode;
  durationSeconds?: number;
}

const scroll = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
`;

/**
 * Infinite horizontal row. Duplicate the children so the loop is seamless.
 */
export function Marquee({ children, durationSeconds = 28 }: MarqueeProps): React.JSX.Element {
  return (
    <Box sx={{ overflow: 'hidden', width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          width: 'max-content',
          animation: `${scroll} ${durationSeconds}s linear infinite`,
          '&:hover': { animationPlayState: 'paused' },
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, pr: 2 }}>{children}</Box>
        <Box sx={{ display: 'flex', gap: 2, pr: 2 }} aria-hidden>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
