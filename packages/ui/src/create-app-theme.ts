/**
 * @file packages/ui/src/create-app-theme.ts
 * @shared MUI theme tokens (8px radius, hospitality palette)
 * @dependencies @mui/material
 */

import { createTheme, type Theme } from '@mui/material/styles';

export type AppSurface = 'guest' | 'admin';

/**
 * Builds the shared MUI theme. Guest uses a warmer paper; admin stays quieter.
 */
export function createAppTheme(surface: AppSurface): Theme {
  const isGuest = surface === 'guest';

  return createTheme({
    shape: {
      borderRadius: 8,
    },
    palette: {
      mode: 'light',
      primary: {
        main: '#1b3a4b',
      },
      secondary: {
        main: '#9a5b3c',
      },
      success: {
        main: '#2f6f4e',
      },
      info: {
        main: '#3d6b8a',
      },
      warning: {
        main: '#b8862a',
      },
      background: {
        default: isGuest ? '#f7f3ee' : '#f4f4f2',
        paper: isGuest ? '#fffdf9' : '#ffffff',
      },
      text: {
        primary: '#1a1a1a',
        secondary: '#4a4a4a',
      },
    },
    typography: {
      fontFamily: '"Source Sans 3", "Helvetica Neue", Arial, sans-serif',
      h1: { fontWeight: 600, letterSpacing: '-0.03em' },
      h2: { fontWeight: 600, letterSpacing: '-0.02em' },
      h3: { fontWeight: 600, letterSpacing: '-0.02em' },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
          },
        },
      },
    },
  });
}
