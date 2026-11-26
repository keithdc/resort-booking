/**
 * @file apps/admin/src/features/team/components/invites-table.tsx
 * @feature team
 * @dependencies MUI, role-chip
 */

'use client';

import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import TimerOffOutlinedIcon from '@mui/icons-material/TimerOffOutlined';
import { Box, Button, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { TeamInvite } from '@resort-booking/shared-types';
import { RoleChip } from '@/shared/components/role-chip';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { formatDateTime } from '../utils/format-time';
import { VISUALLY_HIDDEN } from '@/shared/utils/visually-hidden';

interface InvitesTableProps {
  invites: TeamInvite[];
  busy: boolean;
  /** Whether the server can email links: then each row offers "Email new link" next to "Copy new link". */
  mailEnabled: boolean;
  onRevoke: (invite: TeamInvite) => void;
  onNewLink: (invite: TeamInvite, sendEmail: boolean) => void;
}

/**
 * Pending invitations and access resets, with when they expire. Revoking asks for confirmation (the parent does).
 * A link cannot be shown again (only its fingerprint is stored), so a new link replaces it: "Copy new link" shows it,
 * "Email new link" (only when email is set up) also emails it.
 * An expired link stays listed so the admin can get a new link or revoke it.
 */
export function InvitesTable({ invites, busy, mailEnabled, onRevoke, onNewLink }: InvitesTableProps): React.JSX.Element {
  const compact = useCompactLayout();
  const status = (invite: TeamInvite): React.JSX.Element =>
    invite.expired ? (
      <Chip size="small" color="warning" icon={<TimerOffOutlinedIcon />} label="Expired" />
    ) : (
      <Chip size="small" color="info" icon={<ScheduleOutlinedIcon />} label="Waiting" />
    );
  const buttons = (invite: TeamInvite): React.JSX.Element => (
    <>
      {invite.isReset ? null : (
        <>
          {mailEnabled ? (
            <Button size="small" disabled={busy} onClick={(): void => onNewLink(invite, true)} aria-label={`Email a new link to ${invite.fullName}`}>
              Email new link
            </Button>
          ) : null}
          <Button size="small" disabled={busy} onClick={(): void => onNewLink(invite, false)} aria-label={mailEnabled ? `Copy a new link for ${invite.fullName}` : `Get a new link for ${invite.fullName}`}>
            {mailEnabled ? 'Copy new link' : 'New link'}
          </Button>
        </>
      )}
      <Button size="small" color="error" disabled={busy} onClick={(): void => onRevoke(invite)} aria-label={`Revoke invitation for ${invite.fullName}`}>
        Revoke
      </Button>
    </>
  );
  if (compact) {
    return (
      <Box component="ul" aria-label="Pending invitations" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
        {invites.map((invite): React.JSX.Element => (
          <Box component="li" key={invite.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Typography sx={{ fontWeight: 600 }}>{invite.fullName}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {invite.email}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1.25 }}>
              <RoleChip role={invite.role} />
              <Chip size="small" variant="outlined" label={invite.isReset ? 'Access reset' : 'Invitation'} />
              {status(invite)}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {invite.expired ? 'Expired' : 'Expires'} {formatDateTime(invite.expiresAt)}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5, '& > button': { flex: '1 1 120px' } }}>
              {buttons(invite)}
            </Stack>
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <TableContainer>
      <Table size="small" aria-label="Pending invitations">
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Link</TableCell>
            <TableCell align="right">
              <Box component="span" sx={VISUALLY_HIDDEN}>
                Actions
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invites.map((invite): React.JSX.Element => (
            <TableRow key={invite.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {invite.fullName}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                  {invite.email}
                </Typography>
              </TableCell>
              <TableCell>
                <RoleChip role={invite.role} />
              </TableCell>
              <TableCell>{invite.isReset ? 'Access reset' : 'Invitation'}</TableCell>
              <TableCell>
                <Stack spacing={0.5} alignItems="flex-start">
                  {status(invite)}
                  <Typography variant="caption" color="text.secondary">
                    {invite.expired ? 'Expired' : 'Expires'} {formatDateTime(invite.expiresAt)}
                  </Typography>
                </Stack>
              </TableCell>
              <TableCell align="right">
                {buttons(invite)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
