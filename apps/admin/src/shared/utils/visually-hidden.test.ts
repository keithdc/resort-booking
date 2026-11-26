/**
 * @file apps/admin/src/shared/utils/visually-hidden.test.ts
 * @shared Guards the hidden-text style against the MUI "1 means 100%" trap
 */

import { describe, expect, it } from 'vitest';
import { VISUALLY_HIDDEN } from './visually-hidden';

describe('VISUALLY_HIDDEN', () => {
  it('uses pixel sizes, because a bare 1 in sx means 100%', () => {
    expect(VISUALLY_HIDDEN.width).toBe('1px');
    expect(VISUALLY_HIDDEN.height).toBe('1px');
  });
});
