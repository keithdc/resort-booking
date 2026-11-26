/**
 * @file apps/admin/src/features/team/components/members-table.tsx
 * @feature team
 * @dependencies MUI, role-chip, member-actions
 */

'use client';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import { Box, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { TeamMember } from '@resort-booking/shared-types';
import { RoleChip } from '@/shared/components/role-chip';
import { UserAvatar } from '@/shared/components/user-avatar';
import { formatLastSignIn } from '../utils/format-time';
import { MemberActions, type MemberAction } from './member-actions';
import { VISUALLY_HIDDEN } from '@/shared/utils/visually-hidden';

interface MembersTableProps {
  members: TeamMember[];
  /** Disabled while a change is running. */
  busy: boolean;
  onAction: (member: TeamMember, action: MemberAction) => void;
}

/**
 * Name, email, role, status and last sign-in, with an actions menu per row. "You" is marked; a switched-off
 * person is greyed and labelled in words as well as colour.
 */
export function MembersTable({ members, busy, onAction }: MembersTableProps): React.JSX.Element {
  return (
    <TableContainer>
      <Table size="small" aria-label="Team members">
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Last sign-in</TableCell>
            <TableCell align="right">
              <Box component="span" sx={VISUALLY_HIDDEN}>
                Actions
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {members.map((member): React.JSX.Element => (
            <TableRow key={member.id} hover sx={{ opacity: member.active ? 1 : 0.7 }}>
              <TableCell>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <UserAvatar name={member.fullName} size={36} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {member.fullName}
                      {member.isYou ? (
                        <Typography component="span" variant="caption" color="text.secondary">
                          {' '}
                          (you)
                        </Typography>
                      ) : null}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                      {member.email}
                    </Typography>
                  </Box>
                </Stack>
              </TableCell>
              <TableCell>
                <RoleChip role={member.role} />
              </TableCell>
              <TableCell>
                {member.active ? (
                  <Chip size="small" color="success" icon={<CheckCircleOutlineIcon />} label="Active" />
                ) : (
                  <Chip size="small" icon={<PauseCircleOutlineIcon />} label="Switched off" />
                )}
              </TableCell>
              <TableCell>{formatLastSignIn(member.lastLoginAt)}</TableCell>
              <TableCell align="right">
                <MemberActions member={member} disabled={busy} onAction={(action): void => onAction(member, action)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
