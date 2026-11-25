/**
 * @file apps/admin/src/shared/utils/avatar-color.test.ts
 * @shared Initials and avatar tone
 */

import { describe, expect, it } from 'vitest';
import { getAvatarTone, getInitials } from './avatar-color';

describe('getInitials', () => {
  it('takes the first and last word', () => {
    expect(getInitials('Marie Dupont')).toBe('MD');
    expect(getInitials('  jean  paul  martin ')).toBe('JM');
  });

  it('handles one word and an empty name', () => {
    expect(getInitials('marie')).toBe('M');
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });
});

describe('getAvatarTone', () => {
  it('is stable for the same person and always a theme tone', () => {
    expect(getAvatarTone('Marie Dupont')).toBe(getAvatarTone('Marie Dupont'));
    expect(['primary', 'secondary', 'success', 'info', 'warning', 'error']).toContain(getAvatarTone('Humphreys Hospitality'));
    expect(['primary', 'secondary', 'success', 'info', 'warning', 'error']).toContain(getAvatarTone(''));
  });
});
