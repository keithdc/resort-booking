/**
 * @file packages/ui/src/admin-theme.test.ts
 * @shared Admin theme contrast and guest-theme isolation
 */

import { describe, expect, it } from 'vitest';
import { ADMIN_TONES, adminContrastPairs } from './admin-tokens';
import { blendHex, contrastRatio, hexToRgb, relativeLuminance } from './contrast';
import { createAppTheme } from './create-app-theme';

describe('contrast helpers', () => {
  it('knows the extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('is the same whichever colour is first', () => {
    expect(contrastRatio('#0f4c5c', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#0f4c5c'), 10);
  });

  it('matches a known WCAG value (grey 767676 on white is 4.54)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('reads hex and rejects anything else', () => {
    expect(hexToRgb('#0f4c5c')).toEqual({ r: 15, g: 76, b: 92 });
    expect(() => hexToRgb('red')).toThrow();
    expect(() => hexToRgb('#fff')).toThrow();
  });

  it('blends a tone over a background', () => {
    expect(blendHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(blendHex('#123456', '#ffffff', 1)).toBe('#123456');
    expect(blendHex('#123456', '#ffffff', 0)).toBe('#ffffff');
  });
});

describe('admin tokens', () => {
  it.each(adminContrastPairs().map((pair) => [pair.name, pair] as const))('%s is readable', (_name, pair) => {
    expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(pair.minimum);
  });

  it('defines a main, dark and light for every tone', () => {
    for (const tone of Object.values(ADMIN_TONES)) {
      expect(tone.main).toMatch(/^#[0-9a-f]{6}$/);
      expect(tone.dark).toMatch(/^#[0-9a-f]{6}$/);
      expect(tone.light).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('createAppTheme', () => {
  it('gives admin the deep teal primary and the tinted page', () => {
    const theme = createAppTheme('admin');
    expect(theme.palette.primary.main).toBe(ADMIN_TONES.primary.main);
    expect(theme.palette.background.default).toBe('#eef2f4');
    expect(theme.shape.borderRadius).toBe(8);
  });

  it('leaves the guest theme exactly as it was', () => {
    const theme = createAppTheme('guest');
    expect(theme.palette.primary.main).toBe('#1b3a4b');
    expect(theme.palette.secondary.main).toBe('#9a5b3c');
    expect(theme.palette.background.default).toBe('#f7f3ee');
    expect(theme.palette.background.paper).toBe('#fffdf9');
    expect(theme.components?.MuiChip).toBeUndefined();
    expect(theme.components?.MuiTableCell).toBeUndefined();
  });

  it('keeps the 8px radius on admin buttons and inputs', () => {
    const theme = createAppTheme('admin');
    expect(theme.components?.MuiButton?.styleOverrides?.root).toMatchObject({ borderRadius: 8 });
  });
});
