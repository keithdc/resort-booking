/**
 * @file apps/admin/src/shared/utils/mobile-theme.test.ts
 * @shared Phone theme overrides
 */

import { createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { mobileThemeOptions, TAP_TARGET, TOUCH_MEDIA } from './mobile-theme';
import { stickyFirstColumn } from './sticky-first-column';

describe('mobileThemeOptions', () => {
  const theme = createTheme(mobileThemeOptions());

  it('keeps touch targets at 44px or more', () => {
    expect(TAP_TARGET).toBeGreaterThanOrEqual(44);
    const button = theme.components?.MuiButton?.styleOverrides?.root as Record<string, { minHeight: number }>;
    expect(button[TOUCH_MEDIA]?.minHeight).toBe(TAP_TARGET);
    const icon = theme.components?.MuiIconButton?.styleOverrides?.root as Record<string, { minWidth: number; minHeight: number }>;
    expect(icon[TOUCH_MEDIA]).toEqual({ minWidth: TAP_TARGET, minHeight: TAP_TARGET });
  });

  it('only touches touch and narrow screens, never the desktop', () => {
    expect(TOUCH_MEDIA).toContain('max-width:899.95px');
    expect(TOUCH_MEDIA).toContain('pointer: coarse');
  });

  it('makes dialogs full screen below sm', () => {
    const paper = theme.components?.MuiDialog?.styleOverrides?.paper;
    expect(typeof paper).toBe('function');
    const styles = (paper as (arg: { theme: typeof theme }) => Record<string, Record<string, Record<string, unknown>>>)({ theme });
    const phone = styles[theme.breakpoints.down('sm')]?.['&&'];
    expect(phone?.height).toBe('100%');
    expect(phone?.borderRadius).toBe(0);
  });

  it('shrinks icons on phones only', () => {
    const medium = theme.components?.MuiSvgIcon?.styleOverrides?.fontSizeMedium;
    const styles = (medium as (arg: { theme: typeof theme }) => Record<string, { fontSize: string }>)({ theme });
    expect(styles[theme.breakpoints.down('sm')]?.fontSize).toBe('1.25rem');
  });
});

describe('stickyFirstColumn', () => {
  it('pins the first column below md and leaves desktop alone', () => {
    const theme = createTheme();
    const sx = stickyFirstColumn(theme);
    expect(Object.keys(sx)).toEqual([theme.breakpoints.down('md')]);
    const rules = sx[theme.breakpoints.down('md')] as Record<string, Record<string, unknown>>;
    expect(rules['& th:first-of-type, & td:first-of-type']?.position).toBe('sticky');
  });
});
