/**
 * @file apps/web/src/shared/components/app-providers.tsx
 * @shared MUI theme for the guest app (phone-friendly overrides on top of the shared guest theme)
 * @dependencies @mui/material, @resort-booking/ui, motion
 */

'use client';

import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { createTheme, type Theme } from '@mui/material/styles';
import { createAppTheme } from '@resort-booking/ui';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * The shared guest theme plus phone rules. They live here, not in `packages/ui`, because the admin app
 * uses the same shared theme and must not change. Below `md`: 44px touch targets and smaller headings.
 */
export function createGuestTheme(): Theme {
  const base = createAppTheme('guest');
  const belowMd = base.breakpoints.down('md');
  const belowSm = base.breakpoints.down('sm');
  return createTheme(base, {
    typography: {
      h2: { [belowSm]: { fontSize: '2.5rem' } },
      h3: { [belowSm]: { fontSize: '2rem' } },
      h4: { [belowSm]: { fontSize: '1.625rem' } },
      // 12px captions are hard to read on a phone.
      caption: { [belowSm]: { fontSize: '0.8125rem' } },
      overline: { [belowSm]: { fontSize: '0.8125rem' } },
    },
    components: {
      // Phone icon scale: glyphs shrink (24 -> 20, 20 -> 16, 35 -> 28) while hit areas stay 44px.
      MuiSvgIcon: {
        styleOverrides: {
          fontSizeMedium: { [belowSm]: { fontSize: '1.25rem' } },
          fontSizeSmall: { [belowSm]: { fontSize: '1rem' } },
          fontSizeLarge: { [belowSm]: { fontSize: '1.75rem' } },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { [belowMd]: { minHeight: 44 } },
          startIcon: { [belowSm]: { marginRight: 6, '& > *:nth-of-type(1)': { fontSize: 18 } } },
          endIcon: { [belowSm]: { marginLeft: 6, '& > *:nth-of-type(1)': { fontSize: 18 } } },
        },
      },
      MuiChip: {
        styleOverrides: {
          icon: { [belowSm]: { fontSize: 16, marginLeft: 8 } },
          deleteIcon: { [belowSm]: { fontSize: 16 } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { [belowMd]: { minWidth: 44, minHeight: 44 } },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: { [belowMd]: { padding: 12 } },
        },
      },
      MuiRadio: {
        styleOverrides: {
          root: { [belowMd]: { padding: 12 } },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: { [belowMd]: { minHeight: 56 } },
        },
      },
      MuiAlert: {
        styleOverrides: {
          // A long message plus an action button would squeeze the text; the action drops below it.
          root: { [belowSm]: { flexWrap: 'wrap' } },
          icon: { [belowSm]: { fontSize: 18, padding: '8px 0', marginRight: 10 } },
          message: { [belowSm]: { flex: '1 1 0', minWidth: 0 } },
          action: { [belowSm]: { flexBasis: '100%', marginLeft: 0, paddingLeft: 0, marginTop: 4 } },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: { [belowSm]: { flexDirection: 'column-reverse', alignItems: 'stretch', gap: 8, padding: 16, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } },
        },
      },
    },
  });
}

const theme = createGuestTheme();

/**
 * Page-wide rules CSS cannot get from component styles: safe areas, tap behaviour, reduced motion,
 * and bigger map buttons on touch screens.
 */
const GLOBAL_RULES = {
  // Notches and rounded corners: keep content out of the cut-outs when a phone is held sideways.
  body: {
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
  },
  // No 300ms tap delay or double-tap zoom on controls (pinch zoom still works).
  'a, button, [role="button"], input, select, textarea, label, summary': { touchAction: 'manipulation' },
  // The guest asked their device for less motion: stop decorative animation and smooth scrolling.
  '@media (prefers-reduced-motion: reduce)': {
    '*, *::before, *::after': {
      animationDuration: '0.01ms !important',
      animationIterationCount: '1 !important',
      transitionDuration: '0.01ms !important',
      scrollBehavior: 'auto !important',
    },
  },
  // MapLibre's zoom buttons are 29px; fingers need 44px.
  '@media (max-width: 899.95px)': {
    '.maplibregl-ctrl-group button': { width: 44, height: 44 },
    '.maplibregl-ctrl-top-right': { margin: '12px 12px 0 0' },
    // Smaller glyphs inside the 44px map buttons, and a smaller place pin.
    '.maplibregl-ctrl button .maplibregl-ctrl-icon': { backgroundSize: '20px' },
    '.maplibregl-marker[role="img"] > div': { transform: 'scale(0.8)' },
    '.maplibregl-popup-close-button': { width: 44, height: 44, fontSize: 24 },
  },
} as const;

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Guest theme + CssBaseline + page-wide phone rules. Motion animations follow the device's
 * reduced-motion setting.
 */
export function AppProviders({ children }: AppProvidersProps): React.JSX.Element {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles styles={GLOBAL_RULES} />
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
