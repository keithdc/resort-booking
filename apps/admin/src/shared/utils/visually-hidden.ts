/**
 * @file apps/admin/src/shared/utils/visually-hidden.ts
 * @shared Style for text that screen readers announce but sighted users do not see
 */

/**
 * Pixel sizes on purpose: in MUI's `sx`, a bare `1` means 100%, which made the "hidden" text as wide as its
 * container and pushed the whole page sideways (a horizontal scrollbar on big screens).
 */
export const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
