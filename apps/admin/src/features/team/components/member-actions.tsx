/**
 * @file apps/admin/src/features/team/components/member-actions.tsx
 * @feature team
 * @dependencies MUI
 */

'use client';

import MoreVertIcon from '@mui/icons-material/MoreVert';
import { IconButton, ListItemText, Menu, MenuItem } from '@mui/material';
import type { TeamMember } from '@resort-booking/shared-types';
import { useState } from 'react';

export type MemberAction =
  | 'make-admin'
  | 'make-employee'
  | 'deactivate'
  | 'reactivate'
  | 'reset-access'
  | 'reset-two-factor'
  | 'grant-refund-access'
  | 'remove-refund-access';

interface MemberActionsProps {
  member: TeamMember;
  disabled: boolean;
  onAction: (action: MemberAction) => void;
}

/**
 * Which actions apply to this row. You cannot switch yourself off or reset your own access (use Account). Refund
 * access is only for employees (an admin always has it) and never for yourself.
 */
export function actionsFor(member: TeamMember): { action: MemberAction; label: string }[] {
  const items: { action: MemberAction; label: string }[] = [
    member.role === 'admin' ? { action: 'make-employee', label: 'Make employee' } : { action: 'make-admin', label: 'Make admin' },
  ];
  if (member.role === 'employee' && !member.isYou) {
    items.push(
      member.canManageRefunds
        ? { action: 'remove-refund-access', label: 'Remove refund access' }
        : { action: 'grant-refund-access', label: 'Give refund access' },
    );
  }
  if (!member.isYou) {
    items.push(member.active ? { action: 'deactivate', label: 'Switch off' } : { action: 'reactivate', label: 'Switch back on' });
    if (member.active) {
      items.push({ action: 'reset-access', label: 'Reset access' });
      items.push({ action: 'reset-two-factor', label: 'Reset two-factor' });
    }
  }
  return items;
}

/**
 * The "..." menu of a member row.
 */
export function MemberActions({ member, disabled, onAction }: MemberActionsProps): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const items = actionsFor(member);
  return (
    <>
      <IconButton aria-label={`Actions for ${member.fullName}`} aria-haspopup="menu" disabled={disabled} onClick={(event): void => setAnchor(event.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={(): void => setAnchor(null)}>
        {items.map((item): React.JSX.Element => (
          <MenuItem
            key={item.action}
            onClick={(): void => {
              setAnchor(null);
              onAction(item.action);
            }}
          >
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
