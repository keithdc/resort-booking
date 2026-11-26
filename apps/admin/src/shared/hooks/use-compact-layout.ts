/**
 * @file apps/admin/src/shared/hooks/use-compact-layout.ts
 * @shared One answer to "is this a phone or small tablet?" for layouts that swap structure (cards vs table)
 * @dependencies @mui/material useMediaQuery
 */

'use client';

import { useMediaQuery, useTheme } from '@mui/material';

/**
 * True below the `md` breakpoint (900px): where the sidebar is a drawer, tables become cards and the
 * calendar uses compact cells. False on the server and in jsdom (no matchMedia), so tests and the first
 * paint get the desktop structure.
 */
export function useCompactLayout(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

/**
 * True below `sm` (600px): a phone. For things that must be redrawn narrower than a small tablet needs,
 * such as chart axes.
 */
export function usePhoneLayout(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}
