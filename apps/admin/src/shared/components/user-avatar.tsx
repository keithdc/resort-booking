/**
 * @file apps/admin/src/shared/components/user-avatar.tsx
 * @shared Staff and guest avatar: initials on a stable theme colour
 * @dependencies MUI
 */

'use client';

import { Avatar } from '@mui/material';
import { getAvatarTone, getInitials } from '@/shared/utils/avatar-color';

interface UserAvatarProps {
  name: string;
  size?: number;
}

/**
 * Deterministic colour from the name, taken from the theme (never a hardcoded colour).
 */
export function UserAvatar({ name, size = 40 }: UserAvatarProps): React.JSX.Element {
  const tone = getAvatarTone(name);
  return (
    <Avatar
      aria-hidden
      sx={{
        width: { xs: Math.round(size * 0.85), sm: size },
        height: { xs: Math.round(size * 0.85), sm: size },
        fontSize: { xs: size * 0.85 * 0.4, sm: size * 0.4 },
        fontWeight: 700,
        bgcolor: `${tone}.main`,
        color: `${tone}.contrastText`,
      }}
    >
      {getInitials(name)}
    </Avatar>
  );
}
