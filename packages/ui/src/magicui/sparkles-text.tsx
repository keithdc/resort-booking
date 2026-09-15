/**
 * @file packages/ui/src/magicui/sparkles-text.tsx
 * @shared Magic UI Sparkles Text — https://magicui.design/docs/components/sparkles-text
 * @dependencies motion, MUI theme tokens
 */

'use client';

import { Box, Typography, type TypographyProps } from '@mui/material';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

interface SparklesTextProps {
  children: ReactNode;
  variant?: TypographyProps['variant'];
  component?: TypographyProps['component'];
}

interface SparkleSpec {
  id: number;
  top: string;
  left: string;
  delay: number;
  size: number;
  color: 'primary' | 'secondary';
}

/**
 * Headline sparkles using primary and secondary theme colors.
 */
export function SparklesText({
  children,
  variant = 'inherit',
  component = 'span',
}: SparklesTextProps): React.JSX.Element {
  const [mounted, setMounted] = useState(false);
  const sparkles = useMemo((): SparkleSpec[] => {
    return [0, 1, 2, 3, 4, 5].map((id): SparkleSpec => ({
      id,
      top: `${8 + ((id * 13) % 70)}%`,
      left: `${6 + ((id * 17) % 88)}%`,
      delay: id * 0.35,
      size: 4 + (id % 3),
      color: id % 2 === 0 ? 'primary' : 'secondary',
    }));
  }, []);

  useEffect((): void => {
    setMounted(true);
  }, []);

  return (
    <Box sx={{ position: 'relative', display: 'inline-block', pr: 1, py: 0.5 }}>
      {mounted
        ? sparkles.map((sparkle): React.JSX.Element => (
            <Box
              key={sparkle.id}
              component={motion.span}
              animate={{ opacity: [0.15, 1, 0.15], scale: [0.6, 1, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: sparkle.delay, ease: 'easeInOut' }}
              sx={{
                position: 'absolute',
                top: sparkle.top,
                left: sparkle.left,
                width: sparkle.size,
                height: sparkle.size,
                borderRadius: '50%',
                bgcolor: sparkle.color === 'primary' ? 'primary.main' : 'secondary.main',
                pointerEvents: 'none',
              }}
            />
          ))
        : null}
      <Typography component={component} variant={variant} sx={{ position: 'relative' }}>
        {children}
      </Typography>
    </Box>
  );
}
