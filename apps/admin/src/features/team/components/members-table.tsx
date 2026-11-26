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
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { UserAvatar } from '@/shared/components/user-avatar';
import { formatLastSignIn } from '../utils/format-time';
import { MemberActions, type MemberAction } from './member-actions';
import { MoneyAccessChip } from './money-access-chip';
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
  const compact = useCompactLayout();
  if (compact) {
    return (
      <Box component="ul" aria-label="Team members" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
        {members.map((member): React.JSX.Element => (
          <Box
            component="li"
            key={member.id}
            sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, opacity: member.active ? 1 : 0.7 }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <UserAvatar name={member.fullName} size={40} />
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {member.fullName}
                  {member.isYou ? (
                    <Typography component="span" variant="body2" color="text.secondary">
                      {' '}
                      (you)
                    </Typography>
                  ) : null}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {member.email}
                </Typography>
              </Box>
              <MemberActions member={member} disabled={busy} onAction={(action): void => onAction(member, action)} />
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1.5 }}>
              <RoleChip role={member.role} />
              <MoneyAccessChip role={member.role} canManageRefunds={member.canManageRefunds} />
              {member.active ? (
                <Chip size="small" color="success" icon={<CheckCircleOutlineIcon />} label="Active" />
              ) : (
                <Chip size="small" icon={<PauseCircleOutlineIcon />} label="Switched off" />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Last sign-in: {formatLastSignIn(member.lastLoginAt)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <TableContainer>
      <Table size="small" aria-label="Team members">
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Refunds and money</TableCell>
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
                <MoneyAccessChip role={member.role} canManageRefunds={member.canManageRefunds} />
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
