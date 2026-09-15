/**
 * @file packages/ui/src/magicui/animated-gradient-text.tsx
 * @shared Magic UI Animated Gradient Text — https://magicui.design/docs/components/animated-gradient-text
 * @dependencies @mui/material
 */

'use client';

import { Box, keyframes, Typography, type TypographyProps } from '@mui/material';
import type { ReactNode } from 'react';

interface AnimatedGradientTextProps {
  children: ReactNode;
  component?: TypographyProps['component'];
  variant?: TypographyProps['variant'];
}

const shift = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 100% 50%; }
`;

/**
 * Headline with a slow primary–secondary gradient sweep.
 */
export function AnimatedGradientText({
  children,
  component = 'span',
  variant = 'inherit',
}: AnimatedGradientTextProps): React.JSX.Element {
  return (
    <Typography
      component={component}
      variant={variant}
      sx={{
        display: 'inline',
        background: (theme) =>
          `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main}, ${theme.palette.primary.main})`,
        backgroundSize: '200% 100%',
        animation: `${shift} 8s linear infinite`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * Small announcement chip used above a hero.
 */
export function AnimatedGradientBadge({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1.5,
        py: 0.75,
        mb: 2,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <AnimatedGradientText variant="body2">{children}</AnimatedGradientText>
    </Box>
  );
}
