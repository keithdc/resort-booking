/**
 * @file packages/ui/src/magicui/border-beam.tsx
 * @shared Magic UI Border Beam — https://magicui.design/docs/components/border-beam
 * @dependencies @mui/material
 */

'use client';

import { Box, keyframes } from '@mui/material';
import type { ReactNode } from 'react';

interface BorderBeamProps {
  children: ReactNode;
}

const travel = keyframes`
  0% { offset-distance: 0%; }
  100% { offset-distance: 100%; }
`;

/**
 * Soft moving highlight around a surface. 8px radius.
 */
export function BorderBeam({ children }: BorderBeamProps): React.JSX.Element {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 1,
        p: '1px',
        bgcolor: 'divider',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: (theme) =>
            `radial-gradient(circle, ${theme.palette.secondary.main}, transparent 70%)`,
          offsetPath: 'rect(0 auto auto 0 round 8px)',
          animation: `${travel} 7s linear infinite`,
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'relative',
          borderRadius: 1,
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
