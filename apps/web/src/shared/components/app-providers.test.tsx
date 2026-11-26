// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/app-providers.test.tsx
 * @shared Guest theme keeps touch targets at 44px below the desktop breakpoint
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders, createGuestTheme } from './app-providers';

describe('createGuestTheme', () => {
  it('keeps the 8px radius of the shared guest theme', () => {
    expect(createGuestTheme().shape.borderRadius).toBe(8);
  });

  it('asks for 44px buttons, icon buttons and 44px-or-bigger checkboxes below md', () => {
    const theme = createGuestTheme();
    const md = theme.breakpoints.down('md');
    const overrides = theme.components;

    const button = overrides?.MuiButton?.styleOverrides?.root as Record<string, { minHeight?: number }>;
    expect(button[md]?.minHeight).toBe(44);
    const icon = overrides?.MuiIconButton?.styleOverrides?.root as Record<string, { minWidth?: number; minHeight?: number }>;
    expect(icon[md]).toMatchObject({ minWidth: 44, minHeight: 44 });
    const checkbox = overrides?.MuiCheckbox?.styleOverrides?.root as Record<string, { padding?: number }>;
    // 20px phone icon + 2 x 12 padding = 44px target
    expect(checkbox[md]?.padding).toBe(12);
  });

  it('shrinks icon glyphs on phones only, and button and chip icons to 18 and 16px', () => {
    const theme = createGuestTheme();
    const sm = theme.breakpoints.down('sm');
    const icon = theme.components?.MuiSvgIcon?.styleOverrides as Record<string, Record<string, { fontSize?: string }>>;
    expect(icon.fontSizeMedium?.[sm]?.fontSize).toBe('1.25rem');
    expect(icon.fontSizeSmall?.[sm]?.fontSize).toBe('1rem');
    expect(icon.fontSizeLarge?.[sm]?.fontSize).toBe('1.75rem');
    const button = theme.components?.MuiButton?.styleOverrides as Record<string, Record<string, Record<string, Record<string, number>>>>;
    expect(button.startIcon?.[sm]?.['& > *:nth-of-type(1)']?.fontSize).toBe(18);
    const chip = theme.components?.MuiChip?.styleOverrides as Record<string, Record<string, { fontSize?: number }>>;
    expect(chip.icon?.[sm]?.fontSize).toBe(16);
  });

  it('shrinks the big headings on phones only', () => {
    const theme = createGuestTheme();
    const sm = theme.breakpoints.down('sm');
    expect((theme.typography.h3 as Record<string, { fontSize?: string }>)[sm]?.fontSize).toBe('2rem');
    expect(theme.typography.h3.fontSize).toBe('3rem');
  });
});

describe('AppProviders', () => {
  afterEach(cleanup);

  it('renders its children', () => {
    render(
      <AppProviders>
        <p>hello</p>
      </AppProviders>,
    );

    expect(screen.getByText('hello')).toBeTruthy();
  });
});
