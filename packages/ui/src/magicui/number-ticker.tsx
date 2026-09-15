/**
 * @file packages/ui/src/magicui/number-ticker.tsx
 * @shared Magic UI Number Ticker — https://magicui.design/docs/components/number-ticker
 * @dependencies motion
 */

'use client';

import { animate, useInView, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface NumberTickerProps {
  value: number;
  delay?: number;
}

/**
 * Counts up to a number when the node is visible.
 */
export function NumberTicker({ value, delay = 0 }: NumberTickerProps): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const isInView = useInView(ref, { once: true });
  const [display, setDisplay] = useState('0');

  useEffect((): (() => void) => {
    const unsubscribe = motionValue.on('change', (latest: number): void => {
      setDisplay(Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(latest));
    });
    return (): void => {
      unsubscribe();
    };
  }, [motionValue]);

  useEffect((): (() => void) | undefined => {
    if (!isInView) {
      return undefined;
    }
    const timeout = window.setTimeout((): void => {
      animate(motionValue, value, { duration: 0.9, ease: 'easeOut' });
    }, delay * 1000);
    return (): void => {
      window.clearTimeout(timeout);
    };
  }, [delay, isInView, motionValue, value]);

  return <span ref={ref}>{display}</span>;
}
