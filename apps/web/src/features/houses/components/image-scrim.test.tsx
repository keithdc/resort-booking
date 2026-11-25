// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/image-scrim.test.tsx
 * @feature houses
 */

import { ThemeProvider, createTheme } from '@mui/material';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageScrim } from './image-scrim';

describe('ImageScrim', () => {
  afterEach(cleanup);

  it('is a decorative gradient from dark at the bottom to clear, with no hard edge', () => {
    const { container } = render(
      <ThemeProvider theme={createTheme()}>
        <ImageScrim />
      </ThemeProvider>,
    );

    const scrim = container.firstElementChild as HTMLElement;
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    const style = getComputedStyle(scrim);
    expect(style.backgroundImage).toContain('linear-gradient(to top');
    expect(style.pointerEvents).toBe('none');
  });
});
