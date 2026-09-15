/**
 * @file packages/ui/src/magicui/blur-fade.tsx
 * @shared Magic UI Blur Fade — https://magicui.design/docs/components/blur-fade
 * @dependencies motion
 */

'use client';

import { motion, useInView } from 'motion/react';
import { useRef, type ReactNode } from 'react';

interface BlurFadeProps {
  children: ReactNode;
  delay?: number;
  inView?: boolean;
}

/**
 * Fades content in with a short blur, once it enters the viewport.
 */
export function BlurFade({ children, delay = 0, inView = true }: BlurFadeProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const inViewResult = useInView(ref, { once: true, margin: '-40px' });
  const visible = !inView || inViewResult;

  const hidden = { opacity: 0, y: 8 };
  const shown = { opacity: 1, y: 0 };

  return (
    <motion.div
      ref={ref}
      initial={inView ? hidden : shown}
      animate={visible ? shown : hidden}
      transition={{ duration: 0.45, delay: delay + 0.04, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
