/**
 * @file packages/ui/src/admin-tokens.ts
 * @shared Admin colour tokens and the text/background pairs that must stay readable
 * @dependencies contrast
 *
 * The only place admin hex values live. The guest theme does not use any of this.
 */

import { blendHex } from './contrast';

export interface ToneTokens {
  main: string;
  dark: string;
  light: string;
}

export type ToneName = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error';

export const ADMIN_TONES: Record<ToneName, ToneTokens> = {
  primary: { main: '#0f4c5c', dark: '#0a3642', light: '#5b9aa8' },
  secondary: { main: '#a3471f', dark: '#7d3513', light: '#f0b48a' },
  success: { main: '#1f7a4d', dark: '#145a36', light: '#5fb88a' },
  info: { main: '#0b66a3', dark: '#084c78', light: '#5aa5d6' },
  warning: { main: '#a35c00', dark: '#7a4500', light: '#e0a24a' },
  error: { main: '#b3261e', dark: '#8a1c16', light: '#e5817b' },
};

export const ADMIN_SURFACE = {
  page: '#eef2f4',
  paper: '#ffffff',
  divider: '#d3dce1',
  textPrimary: '#15222b',
  textSecondary: '#455a64',
  white: '#ffffff',
} as const;

/** How strongly a tone is mixed into a tonal fill (chip, alert, table header, hover). */
export const TONAL_ALPHA = 0.14;
export const TABLE_HEAD_ALPHA = 0.07;
/** The sidebar is the deep primary; its muted text is white at this opacity. */
export const SIDEBAR_MUTED_ALPHA = 0.72;

export interface ContrastPair {
  name: string;
  foreground: string;
  background: string;
  /** 4.5 for body text, 3 for large text and UI parts (icons, bars). */
  minimum: number;
}

/**
 * Every colour pairing the admin theme relies on, as solid colours. A test checks each one.
 */
export function adminContrastPairs(): ContrastPair[] {
  const { page, paper, textPrimary, textSecondary, white } = ADMIN_SURFACE;
  const pairs: ContrastPair[] = [
    { name: 'body text on page', foreground: textPrimary, background: page, minimum: 4.5 },
    { name: 'body text on paper', foreground: textPrimary, background: paper, minimum: 4.5 },
    { name: 'secondary text on page', foreground: textSecondary, background: page, minimum: 4.5 },
    { name: 'secondary text on paper', foreground: textSecondary, background: paper, minimum: 4.5 },
    {
      name: 'text on table header',
      foreground: textPrimary,
      background: blendHex(ADMIN_TONES.primary.main, paper, TABLE_HEAD_ALPHA),
      minimum: 4.5,
    },
    {
      name: 'secondary text on table header',
      foreground: textSecondary,
      background: blendHex(ADMIN_TONES.primary.main, paper, TABLE_HEAD_ALPHA),
      minimum: 4.5,
    },
    {
      name: 'sidebar text',
      foreground: white,
      background: ADMIN_TONES.primary.dark,
      minimum: 4.5,
    },
    {
      name: 'sidebar muted text',
      foreground: blendHex(white, ADMIN_TONES.primary.dark, SIDEBAR_MUTED_ALPHA),
      background: ADMIN_TONES.primary.dark,
      minimum: 4.5,
    },
    {
      name: 'sidebar accent bar',
      foreground: ADMIN_TONES.secondary.light,
      background: ADMIN_TONES.primary.dark,
      minimum: 3,
    },
  ];
  for (const name of Object.keys(ADMIN_TONES) as ToneName[]) {
    const tone = ADMIN_TONES[name];
    pairs.push(
      { name: `${name}: white on solid`, foreground: white, background: tone.main, minimum: 4.5 },
      { name: `${name}: text on paper`, foreground: tone.main, background: paper, minimum: 4.5 },
      { name: `${name}: text on page`, foreground: tone.main, background: page, minimum: 4.5 },
      {
        name: `${name}: dark text on tonal fill (chip)`,
        foreground: tone.dark,
        background: blendHex(tone.main, paper, TONAL_ALPHA),
        minimum: 4.5,
      },
      {
        name: `${name}: dark text on tonal fill over page`,
        foreground: tone.dark,
        background: blendHex(tone.main, page, TONAL_ALPHA),
        minimum: 4.5,
      },
    );
  }
  return pairs;
}
