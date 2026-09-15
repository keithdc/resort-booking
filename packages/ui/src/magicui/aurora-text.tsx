/**
 * @file packages/ui/src/magicui/aurora-text.tsx
 * @shared Magic UI Aurora Text — https://magicui.design/docs/components/aurora-text
 * @dependencies @mui/material
 */

'use client';

import { keyframes, Typography, type TypographyProps } from '@mui/material';
import type { ReactNode } from 'react';

interface AuroraTextProps {
  children: ReactNode;
  component?: TypographyProps['component'];
  variant?: TypographyProps['variant'];
}

const aurora = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

/**
 * Slow aurora wash using primary and secondary tokens.
 */
export function AuroraText({
  children,
  component = 'span',
  variant = 'inherit',
}: AuroraTextProps): React.JSX.Element {
  return (
    <Typography
      component={component}
      variant={variant}
      sx={{
        display: 'inline',
        background: (theme) =>
          `linear-gradient(120deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main}, ${theme.palette.primary.light}, ${theme.palette.secondary.main})`,
        backgroundSize: '240% 240%',
        animation: `${aurora} 10s ease-in-out infinite`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {children}
    </Typography>
  );
}
