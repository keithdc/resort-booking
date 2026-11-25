/**
 * @file apps/admin/src/shared/utils/avatar-color.ts
 * @shared Initials and a stable colour per person
 * @dependencies none
 */

export type AvatarTone = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error';

const TONES: AvatarTone[] = ['primary', 'secondary', 'success', 'info', 'warning', 'error'];

/**
 * Up to two capital letters from a name ("Marie Dupont" -> "MD", "marie" -> "M"); "?" when empty.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word: string): boolean => word !== '');
  if (words.length === 0) {
    return '?';
  }
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Same person, same theme tone every time (a theme token, never a hardcoded colour).
 */
export function getAvatarTone(name: string): AvatarTone {
  const initials = getInitials(name);
  let hash = 0;
  for (const char of initials) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return TONES[hash % TONES.length];
}
