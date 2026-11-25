/**
 * @file packages/ui/src/contrast.ts
 * @shared WCAG contrast maths for theme tokens (pure, no dependencies)
 * @dependencies none
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Reads "#rrggbb" into 0-255 channels. Throws on anything else so a typo in a token fails a test.
 */
export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (match === null) {
    throw new Error(`Not a #rrggbb colour: ${hex}`);
  }
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG relative luminance (0 black .. 1 white).
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio between two colours, 1 (same) to 21 (black on white).
 */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The solid colour you get when `foreground` is painted at `alpha` over `background`
 * (what a tonal chip or a row tint really looks like).
 */
export function blendHex(foreground: string, background: string, alpha: number): string {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  const mix = (f: number, b: number): string =>
    Math.round(f * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(fg.r, bg.r)}${mix(fg.g, bg.g)}${mix(fg.b, bg.b)}`;
}
