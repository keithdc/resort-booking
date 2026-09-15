/**
 * @file packages/ui/src/magicui/highlighter.tsx
 * @shared Magic UI Highlighter — https://magicui.design/docs/components/highlighter
 * @dependencies rough-notation, motion, MUI theme tokens
 */

'use client';

import { Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useInView } from 'motion/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { annotate } from 'rough-notation';
import type { RoughAnnotation, RoughAnnotationType } from 'rough-notation/lib/model';

export type HighlighterAction = RoughAnnotationType;

interface HighlighterProps {
  children: ReactNode;
  action?: HighlighterAction;
  tone?: 'primary' | 'secondary';
  isView?: boolean;
}

/**
 * Marker underline or highlighter wash. Highlight stays translucent so type remains readable.
 */
export function Highlighter({
  children,
  action = 'highlight',
  tone = 'secondary',
  isView = true,
}: HighlighterProps): React.JSX.Element {
  const theme = useTheme();
  const elementRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(elementRef, { once: true, margin: '-10%' });
  const shouldShow = !isView || isInView;
  const ink = tone === 'primary' ? theme.palette.primary.main : theme.palette.secondary.main;
  const color = action === 'highlight' ? alpha(ink, 0.35) : ink;

  useLayoutEffect((): (() => void) | undefined => {
    const element = elementRef.current;
    if (!shouldShow || element === null) {
      return undefined;
    }
    const annotation: RoughAnnotation = annotate(element, {
      type: action,
      color,
      strokeWidth: action === 'underline' ? 2 : 2.5,
      animationDuration: 500,
      iterations: 1,
      padding: action === 'highlight' ? [2, 4, 2, 4] : 2,
      multiline: true,
    });
    annotation.show();
    const resizeObserver = new ResizeObserver((): void => {
      annotation.hide();
      annotation.show();
    });
    resizeObserver.observe(element);
    return (): void => {
      annotation.remove();
      resizeObserver.disconnect();
    };
  }, [action, color, shouldShow]);

  return (
    <Box
      component="span"
      ref={elementRef}
      sx={{
        display: 'inline',
        position: 'relative',
        backgroundColor: 'transparent',
        color: 'text.primary',
        font: 'inherit',
        fontWeight: 600,
        px: 0.15,
      }}
    >
      {children}
    </Box>
  );
}
