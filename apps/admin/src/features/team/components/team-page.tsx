/**
 * @file apps/admin/src/features/team/components/team-page.tsx
 * @feature team
 * @dependencies use-team, use-team-actions, tables and dialogs
 */

'use client';

import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { Alert, Button, Checkbox, FormControlLabel, Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SectionCard } from '@/shared/components/section-card';
import { useTeam } from '../hooks/use-team';
import { useTeamActions, type PendingConfirm } from '../hooks/use-team-actions';
import { InviteDialog } from './invite-dialog';
import { InvitesTable } from './invites-table';
import { IssuedLinkDialog } from './issued-link-dialog';
import { MembersTable } from './members-table';

/** Title, body text and button for a confirm dialog. */
function confirmCopy(item: PendingConfirm): { title: string; body: string; button: string; destructive: boolean } {
  if (item.kind === 'revoke') {
    return {
      title: `Revoke the invitation for ${item.invite.fullName}?`,
      body: 'The link stops working straight away. You can invite them again later.',
      button: 'Revoke invitation',
      destructive: true,
    };
  }
  const name = item.member.fullName;
  switch (item.action) {
    case 'deactivate':
      return { title: `Switch off ${name}?`, body: `${name} is signed out now and cannot sign in until you switch them back on. Their history stays.`, button: 'Switch off', destructive: true };
    case 'make-employee':
      return { title: `Make ${name} an employee?`, body: `${name} loses access to the team, property settings, refunds and money figures. They start without refund access: you can give it back from this menu.`, button: 'Make employee', destructive: true };
    case 'grant-refund-access':
      return {
        title: `Give ${name} refund access?`,
        body: `${name} will be able to retry failed refunds, mark hand refunds as paid, mark pay-at-hotel bookings as paid, choose any refund amount or reason (property cancelled, goodwill), waive the change fee, mark a balance as paid outside the system, and cancel or change a booking on its check-in day, like an admin. Everything ${name} does is recorded in the audit log with their name. It applies from their next action, and you can remove it at any time.`,
        button: 'Give refund access',
        destructive: false,
      };
    case 'remove-refund-access':
      return {
        title: `Remove refund access from ${name}?`,
        body: `${name} goes back to policy refunds only: no retrying or settling refunds, no marking pay-at-hotel bookings as paid, no custom amounts or fee waivers, and a cancellation on the check-in day will carry no refund. It applies from their next action.`,
        button: 'Remove refund access',
        destructive: true,
      };
    case 'reset-two-factor':
      return {
        title: `Reset two-factor for ${name}?`,
        body: `${name} is signed out everywhere and their authenticator app and recovery codes are removed. They can sign in with just their password and set two-factor up again from Account.`,
        button: 'Reset two-factor',
        destructive: true,
      };
    default:
      return {
        title: `Reset access for ${name}?`,
        body: `${name} is signed out everywhere and their password stops working. You get a one-time link so they can choose a new one: copy it to hand over yourself, or email it when email is set up.`,
        button: 'Reset access',
        destructive: true,
      };
  }
}

/**
 * The team screen (admins only): members, pending invitations, and every action with its confirmation.
 */
export function TeamPage(): React.JSX.Element {
  const { overview, loading, error, reload } = useTeam();
  const mailEnabled = overview?.mailEnabled === true;
  const actions = useTeamActions(reload, mailEnabled);
  const copy = actions.confirm === null ? null : confirmCopy(actions.confirm);

  return (
    <>
      <PageHeader
        icon={<GroupsOutlinedIcon />}
        tone="secondary"
        title="Team"
        description="Who can sign in to this workspace, and what they may do. Admins manage everything; employees run the calendar, bookings and check-in, and can also be given refund access."
        actions={
          <Button variant="contained" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={actions.openInvite}>
            Invite someone
          </Button>
        }
      />
      {error !== null ? <Alert severity="error" sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={reload}>Try again</Button>}>{error}</Alert> : null}
      {overview === null ? (
        loading ? (
          <Stack spacing={3} aria-busy="true" aria-label="Loading team">
            <Skeleton variant="rounded" height={220} />
            <Skeleton variant="rounded" height={120} />
          </Stack>
        ) : null
      ) : (
        <Stack spacing={3}>
          <SectionCard icon={<GroupsOutlinedIcon />} title="Members" description={`${String(overview.members.length)} ${overview.members.length === 1 ? 'person' : 'people'} in this workspace`}>
            <MembersTable members={overview.members} busy={actions.pending} onAction={actions.request} />
          </SectionCard>
          <SectionCard icon={<MailOutlineIcon />} tone="info" title="Pending invitations" description="Links you created that nobody has used yet. A link is shown only once, when you create it. If it was lost, get a new link (copy it, or email it when email is set up): the old one stops working.">
            {overview.invites.length === 0 ? (
              <EmptyState icon={<MailOutlineIcon />} title="No pending invitations" hint="Invite someone and they will show up here until they join." action={<Button variant="outlined" onClick={actions.openInvite}>Invite someone</Button>} />
            ) : (
              <InvitesTable invites={overview.invites} busy={actions.pending} mailEnabled={mailEnabled} onRevoke={actions.requestRevoke} onNewLink={actions.newLink} />
            )}
          </SectionCard>
          <Typography variant="body2" color="text.secondary">
            A workspace always keeps at least one active admin. To change your own password or name, use Account.
          </Typography>
        </Stack>
      )}

      <InviteDialog open={actions.inviteOpen} pending={actions.pending} mailEnabled={mailEnabled} error={actions.inviteError} onClose={actions.closeInvite} onSubmit={actions.sendInvite} />
      <IssuedLinkDialog issued={actions.issued?.issued ?? null} title={actions.issued?.title ?? ''} recipient={actions.issued?.recipient ?? ''} onClose={actions.closeIssued} />
      <ConfirmDialog
        open={copy !== null}
        title={copy?.title ?? ''}
        confirmLabel={copy?.button ?? 'Confirm'}
        destructive={copy?.destructive ?? true}
        pending={actions.pending}
        error={actions.confirmError}
        onConfirm={actions.runConfirmed}
        onClose={actions.cancelConfirm}
      >
        {copy?.body}
        {mailEnabled && actions.confirm?.kind === 'member' && actions.confirm.action === 'reset-access' ? (
          <FormControlLabel
            sx={{ display: 'block', mt: 1 }}
            control={<Checkbox checked={actions.emailReset} onChange={(event): void => actions.setEmailReset(event.target.checked)} />}
            label="Email the link to them"
          />
        ) : null}
      </ConfirmDialog>
      <Snackbar open={actions.notice !== null} autoHideDuration={4000} onClose={actions.clearNotice}>
        <Alert severity={actions.notice?.severity ?? 'success'} onClose={actions.clearNotice}>
          {actions.notice?.text}
        </Alert>
      </Snackbar>
    </>
  );
}
