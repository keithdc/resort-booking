/**
 * @file apps/admin/src/features/team/components/money-access-chip.tsx
 * @feature team
 * @dependencies MUI, shared-types
 * Whether a person may handle refunds and money actions, in words and an icon (never colour alone).
 */

'use client';

import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Chip } from '@mui/material';
import type { StaffRole } from '@resort-booking/shared-types';

interface MoneyAccessChipProps {
  role: StaffRole;
  /** The effective permission the API reports (always true for an admin). */
  canManageRefunds: boolean;
}

/** Admin: "Full access". Employee with the permission: "Refund access". Employee without: "Policy refunds only". */
export function MoneyAccessChip({ role, canManageRefunds }: MoneyAccessChipProps): React.JSX.Element {
  if (role === 'admin') {
    return <Chip size="small" variant="outlined" icon={<VerifiedUserOutlinedIcon />} label="Full access" />;
  }
  return canManageRefunds ? (
    <Chip size="small" color="warning" variant="outlined" icon={<PaidOutlinedIcon />} label="Refund access" />
  ) : (
    <Chip size="small" variant="outlined" icon={<LockOutlinedIcon />} label="Policy refunds only" sx={{ color: 'text.secondary' }} />
  );
}
