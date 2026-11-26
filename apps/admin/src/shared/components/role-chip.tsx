/**
 * @file apps/admin/src/shared/components/role-chip.tsx
 * @shared Staff role as a chip (icon + words, never colour alone)
 * @dependencies MUI, shared-types
 */

'use client';

import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import { Chip } from '@mui/material';
import type { StaffRole } from '@resort-booking/shared-types';

/** Plain words for a role, used in chips, menus and notices. */
export const ROLE_LABELS: Record<StaffRole, string> = { admin: 'Admin', employee: 'Employee' };

interface RoleChipProps {
  role: StaffRole;
  size?: 'small' | 'medium';
  /** Light text on the dark sidebar. */
  onDark?: boolean;
}

/**
 * Admin: filled-tone primary with a shield icon. Employee: neutral with a badge icon.
 */
export function RoleChip({ role, size = 'small', onDark = false }: RoleChipProps): React.JSX.Element {
  const icon = role === 'admin' ? <AdminPanelSettingsOutlinedIcon /> : <BadgeOutlinedIcon />;
  if (onDark) {
    return (
      <Chip
        size={size}
        icon={icon}
        label={ROLE_LABELS[role]}
        variant="outlined"
        sx={{ color: 'inherit', borderColor: 'currentColor', '& .MuiChip-icon': { color: 'inherit' } }}
      />
    );
  }
  return <Chip size={size} icon={icon} label={ROLE_LABELS[role]} color={role === 'admin' ? 'primary' : 'default'} variant={role === 'admin' ? 'filled' : 'outlined'} />;
}
