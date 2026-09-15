/**
 * @file packages/ui/src/magicui/magic-card.tsx
 * @shared Magic UI Magic Card — https://magicui.design/docs/components/magic-card
 * @dependencies @mui/material
 */

'use client';

import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';

interface MagicCardProps {
  children: ReactNode;
}

interface Spotlight {
  x: number;
  y: number;
}

/**
 * Card with a cursor spotlight using theme colours. 8px radius.
 */
export function MagicCard({ children }: MagicCardProps): React.JSX.Element {
  const theme = useTheme();
  const [spot, setSpot] = useState<Spotlight>({ x: 50, y: 40 });

  const onMove = useCallback((event: MouseEvent<HTMLDivElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    setSpot({ x, y });
  }, []);

  return (
    <Box
      onMouseMove={onMove}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: '100%',
        '&::before': {
          content: '""',
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(420px circle at ${spot.x}% ${spot.y}%, ${theme.palette.secondary.main}22, transparent 55%)`,
          zIndex: 1,
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 2, height: '100%' }}>{children}</Box>
    </Box>
  );
}
