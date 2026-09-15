/**
 * @file packages/ui/src/magicui/dot-pattern.tsx
 * @shared Magic UI Dot Pattern — https://magicui.design/docs/components/dot-pattern
 * @dependencies @mui/material
 */

'use client';

import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * Subtle dotted hero background from theme text colour.
 */
export function DotPattern(): React.JSX.Element {
  const theme = useTheme();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="1" cy="1" r="1" fill="${theme.palette.text.secondary}"/></svg>`;

  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: 0.16,
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        maskImage: 'radial-gradient(ellipse at 28% 18%, black 18%, transparent 72%)',
      }}
    />
  );
}
