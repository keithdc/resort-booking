/**
 * @file apps/web/src/shared/components/guest-anchor-link.tsx
 * @shared Smooth-scroll header/footer links
 * @dependencies next/navigation
 */

'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Link as MuiLink } from '@mui/material';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface GuestAnchorLinkProps {
  hash: 'search' | 'places' | 'contact';
  children: ReactNode;
  color?: 'text.secondary' | 'primary.main' | 'inherit';
  fontWeight?: number;
}

/**
 * Scrolls on the home page; otherwise opens home then the section.
 */
export function GuestAnchorLink({
  hash,
  children,
  color = 'text.secondary',
  fontWeight,
}: GuestAnchorLinkProps): React.JSX.Element {
  const pathname = usePathname();

  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (pathname !== '/') {
      return;
    }
    event.preventDefault();
    const node = document.getElementById(hash);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `/#${hash}`);
  };

  return (
    <MuiLink
      component={NextLink}
      href={`/#${hash}`}
      underline="hover"
      color={color}
      onClick={onClick}
      sx={{ fontWeight, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
    >
      {children}
    </MuiLink>
  );
}

/**
 * After a full navigation to /#section, finish with a smooth scroll.
 */
export function GuestHashScroller(): null {
  const pathname = usePathname();

  useEffect((): (() => void) | undefined => {
    if (pathname !== '/') {
      return undefined;
    }
    const hash = window.location.hash.replace('#', '');
    if (hash !== 'search' && hash !== 'places' && hash !== 'contact') {
      return undefined;
    }
    const timer = window.setTimeout((): void => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
