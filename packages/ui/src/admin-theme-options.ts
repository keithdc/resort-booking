/**
 * @file packages/ui/src/admin-theme-options.ts
 * @shared Admin-only MUI theme options layered over the shared theme
 * @dependencies @mui/material, admin-tokens
 */

import { alpha, type ThemeOptions } from '@mui/material/styles';
import {
  ADMIN_SURFACE,
  ADMIN_TONES,
  TABLE_HEAD_ALPHA,
  TONAL_ALPHA,
  type ToneName,
  type ToneTokens,
} from './admin-tokens';

const SOFT_SHADOW = '0 1px 2px rgba(15, 41, 51, 0.07), 0 1px 1px rgba(15, 41, 51, 0.04)';
const TONAL_TONES: ToneName[] = ['secondary', 'success', 'info', 'warning', 'error'];

function solidTone(tone: ToneTokens): { main: string; dark: string; light: string; contrastText: string } {
  return { ...tone, contrastText: ADMIN_SURFACE.white };
}

function tonalChip(tone: ToneTokens): Record<string, unknown> {
  return {
    backgroundColor: alpha(tone.main, TONAL_ALPHA),
    color: tone.dark,
    '& .MuiChip-icon': { color: tone.dark },
    '& .MuiChip-deleteIcon': { color: tone.dark },
  };
}

/**
 * Confident-but-calm admin look: deep teal primary, terracotta accent, tinted page, tonal chips,
 * tinted table headers. Every pairing here is checked in admin-theme.test.ts.
 */
export function adminThemeOptions(): ThemeOptions {
  const { primary } = ADMIN_TONES;
  const chipOverrides: Record<string, Record<string, unknown>> = {};
  for (const name of TONAL_TONES) {
    chipOverrides[`filled${name.charAt(0).toUpperCase()}${name.slice(1)}`] = tonalChip(ADMIN_TONES[name]);
  }

  return {
    palette: {
      primary: solidTone(ADMIN_TONES.primary),
      secondary: solidTone(ADMIN_TONES.secondary),
      success: solidTone(ADMIN_TONES.success),
      info: solidTone(ADMIN_TONES.info),
      warning: solidTone(ADMIN_TONES.warning),
      error: solidTone(ADMIN_TONES.error),
      background: { default: ADMIN_SURFACE.page, paper: ADMIN_SURFACE.paper },
      text: { primary: ADMIN_SURFACE.textPrimary, secondary: ADMIN_SURFACE.textSecondary },
      divider: ADMIN_SURFACE.divider,
      action: {
        hover: alpha(primary.main, 0.06),
        selected: alpha(primary.main, 0.12),
        focus: alpha(primary.main, 0.16),
      },
    },
    typography: {
      h4: { fontWeight: 700, letterSpacing: '-0.015em' },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 650 },
      subtitle1: { fontWeight: 650 },
      subtitle2: { fontWeight: 650 },
      overline: { fontWeight: 700, letterSpacing: '0.08em' },
      button: { fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':focus-visible': { outline: `2px solid ${ADMIN_TONES.secondary.main}`, outlineOffset: 2 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: ADMIN_SURFACE.divider },
          elevation1: { boxShadow: SOFT_SHADOW },
        },
      },
      MuiCard: {
        styleOverrides: { root: { boxShadow: SOFT_SHADOW } },
      },
      MuiButton: {
        styleOverrides: {
          root: { fontWeight: 600 },
          containedPrimary: {
            boxShadow: '0 1px 2px rgba(10, 54, 66, 0.3)',
            '&:hover': { backgroundColor: primary.dark },
          },
          outlinedPrimary: {
            borderColor: alpha(primary.main, 0.5),
            '&:hover': { borderColor: primary.main, backgroundColor: alpha(primary.main, 0.06) },
          },
          textPrimary: { '&:hover': { backgroundColor: alpha(primary.main, 0.08) } },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600 },
          outlined: { borderColor: alpha(primary.main, 0.28) },
          ...chipOverrides,
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: alpha(primary.main, TABLE_HEAD_ALPHA),
            color: ADMIN_SURFACE.textPrimary,
            fontWeight: 700,
            borderBottom: `2px solid ${alpha(primary.main, 0.22)}`,
          },
        },
      },
      MuiTableBody: {
        styleOverrides: {
          root: {
            '& .MuiTableRow-root:nth-of-type(even):not(.Mui-selected):not(:hover)': {
              backgroundColor: alpha(primary.main, 0.025),
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 3, borderRadius: '3px 3px 0 0', backgroundColor: ADMIN_TONES.secondary.main },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, '&.Mui-selected': { color: primary.main } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary.main, 0.6) },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: primary.main, borderWidth: 2 },
          },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { alignItems: 'center' } },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontWeight: 700 } },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { backgroundColor: primary.dark, fontSize: '0.8125rem' } },
      },
    },
  };
}
