/**
 * @file apps/web/src/shared/hooks/use-compact-screen.ts
 * @shared Tells client components when to use phone-style UI (full-screen dialogs, sheets)
 * @dependencies @mui/material useMediaQuery, responsive utils
 */

'use client';

import { useMediaQuery } from '@mui/material';
import { BELOW_DESKTOP_MEDIA_QUERY, COMPACT_MEDIA_QUERY } from '../utils/responsive';

/**
 * True on a phone (portrait) or a phone turned sideways. Use it for dialogs that should be
 * full-screen. Layout that only needs CSS should use `sx` breakpoints instead, which never flash.
 * False on the server and before hydration, so the first paint matches the desktop markup.
 */
export function useCompactScreen(): boolean {
  return useMediaQuery(COMPACT_MEDIA_QUERY);
}

/** True below the `md` breakpoint (phones and small tablets), for behaviour that is not just layout. */
export function useBelowDesktop(): boolean {
  return useMediaQuery(BELOW_DESKTOP_MEDIA_QUERY);
}
