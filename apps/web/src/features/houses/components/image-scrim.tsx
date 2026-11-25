/**
 * @file apps/web/src/features/houses/components/image-scrim.tsx
 * @feature houses
 * @dependencies MUI
 */

'use client';

import { alpha, Box } from '@mui/material';

/**
 * A dark gradient over the bottom of a photo so white text on it stays readable, with no hard edge.
 * A client component because the colour comes from a theme callback, which a server component cannot
 * hand to MUI.
 */
export function ImageScrim(): React.JSX.Element {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '60%',
        pointerEvents: 'none',
        background: (theme): string =>
          `linear-gradient(to top, ${alpha(theme.palette.common.black, 0.72)} 0%, ${alpha(theme.palette.common.black, 0)} 100%)`,
      }}
    />
  );
}
