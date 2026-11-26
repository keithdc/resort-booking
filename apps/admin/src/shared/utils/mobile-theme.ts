/**
 * @file apps/admin/src/shared/utils/mobile-theme.ts
 * @shared Phone and small-tablet theme overrides layered on the admin theme (tap targets, dialogs, safe areas)
 * @dependencies @mui/material
 */

import type { Theme, ThemeOptions } from '@mui/material/styles';

/** Minimum touch target, in px (WCAG 2.5.5 / Apple HIG). */
export const TAP_TARGET = 44;

/** Small screens or any coarse pointer (a tablet in landscape is still touched with a finger). */
export const TOUCH_MEDIA = '@media (max-width:899.95px), (pointer: coarse)';

/**
 * Overrides that only apply on touch or narrow screens, so the desktop look is unchanged:
 * 44px tap targets, full-screen dialogs below `sm` with the action bar pinned under the scrolling content,
 * safe-area padding, and long words that wrap instead of widening the page.
 */
export function mobileThemeOptions(): ThemeOptions {
  const tap = { minHeight: TAP_TARGET };
  return {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { WebkitTextSizeAdjust: '100%' },
          body: { overflowWrap: 'break-word' },
        },
      },
      // Icons shrink on phones (the hit area does not: see the 44px minimums below).
      MuiSvgIcon: {
        styleOverrides: {
          fontSizeMedium: ({ theme }: { theme: Theme }) => ({ [theme.breakpoints.down('sm')]: { fontSize: '1.25rem' } }),
          fontSizeSmall: ({ theme }: { theme: Theme }) => ({ [theme.breakpoints.down('sm')]: { fontSize: '1rem' } }),
          fontSizeLarge: ({ theme }: { theme: Theme }) => ({ [theme.breakpoints.down('sm')]: { fontSize: '1.75rem' } }),
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { [TOUCH_MEDIA]: tap },
          startIcon: ({ theme }: { theme: Theme }) => ({
            [theme.breakpoints.down('sm')]: { marginRight: 6, '& > *:nth-of-type(1)': { fontSize: 18 } },
          }),
          endIcon: ({ theme }: { theme: Theme }) => ({
            [theme.breakpoints.down('sm')]: { marginLeft: 6, '& > *:nth-of-type(1)': { fontSize: 18 } },
          }),
        },
      },
      MuiToggleButton: { styleOverrides: { root: { [TOUCH_MEDIA]: tap } } },
      MuiIconButton: { styleOverrides: { root: { [TOUCH_MEDIA]: { minWidth: TAP_TARGET, minHeight: TAP_TARGET } } } },
      MuiChip: {
        styleOverrides: {
          clickable: { [TOUCH_MEDIA]: { height: TAP_TARGET, minWidth: TAP_TARGET } },
          icon: ({ theme }: { theme: Theme }) => ({ [theme.breakpoints.down('sm')]: { fontSize: 16 } }),
          iconSmall: ({ theme }: { theme: Theme }) => ({ [theme.breakpoints.down('sm')]: { fontSize: 14 } }),
        },
      },
      MuiSelect: {
        styleOverrides: {
          // Select sets its own min-height, so it needs the extra specificity.
          select: { '&&&': { [TOUCH_MEDIA]: { boxSizing: 'border-box', minHeight: TAP_TARGET, display: 'flex', alignItems: 'center' } } },
        },
      },
      MuiTab: { styleOverrides: { root: { [TOUCH_MEDIA]: { minHeight: 48 } } } },
      MuiMenuItem: { styleOverrides: { root: { [TOUCH_MEDIA]: tap } } },
      MuiListItemButton: { styleOverrides: { root: { [TOUCH_MEDIA]: tap } } },
      MuiCheckbox: { styleOverrides: { root: { [TOUCH_MEDIA]: { padding: 10 } } } },
      MuiRadio: { styleOverrides: { root: { [TOUCH_MEDIA]: { padding: 10 } } } },
      MuiOutlinedInput: {
        styleOverrides: {
          // 16px stops iOS Safari zooming the page when a field is focused.
          input: ({ theme }: { theme: Theme }) => ({
            [TOUCH_MEDIA]: { boxSizing: 'border-box', minHeight: TAP_TARGET },
            [theme.breakpoints.down('sm')]: { fontSize: '1rem' },
          }),
        },
      },
      MuiInputBase: {
        styleOverrides: {
          input: ({ theme }: { theme: Theme }) => ({ [theme.breakpoints.down('sm')]: { fontSize: '1rem' } }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme }: { theme: Theme }) => ({
            // A <form> wrapping content + actions must stay a flex column so the content scrolls and the actions stay put.
            '& > form': { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 },
            [theme.breakpoints.down('sm')]: {
              '&&': {
                margin: 0,
                width: '100%',
                maxWidth: '100%',
                height: '100%',
                maxHeight: '100%',
                borderRadius: 0,
              },
            },
          }),
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: ({ theme }: { theme: Theme }) => ({
            overflowWrap: 'anywhere',
            [theme.breakpoints.down('sm')]: { paddingLeft: 16, paddingRight: 16 },
          }),
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: ({ theme }: { theme: Theme }) => ({
            [theme.breakpoints.down('sm')]: { paddingLeft: 16, paddingRight: 16 },
          }),
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: ({ theme }: { theme: Theme }) => ({
            flexShrink: 0,
            [theme.breakpoints.down('sm')]: {
              flexWrap: 'wrap',
              gap: 8,
              padding: '12px 16px',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
              borderTop: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.background.paper,
              '& > :not(style) ~ :not(style)': { marginLeft: 0 },
            },
          }),
        },
      },
      MuiSnackbar: {
        styleOverrides: {
          root: { '&.MuiSnackbar-anchorOriginBottomCenter, &.MuiSnackbar-anchorOriginBottomLeft': { bottom: 'calc(8px + env(safe-area-inset-bottom))' } },
        },
      },
    },
  };
}
