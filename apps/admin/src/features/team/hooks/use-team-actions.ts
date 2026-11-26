/**
 * @file apps/admin/src/features/team/hooks/use-team-actions.ts
 * @feature team
 * @dependencies team-api, team-messages
 */

'use client';

import type { CreateInviteRequest, InviteIssued, TeamInvite, TeamMember } from '@resort-booking/shared-types';
import { useState } from 'react';
import type { MemberAction } from '../components/member-actions';
import { createInvite, resetAccess, resetTwoFactor, revokeInvite, updateMember } from '../services/team-api';
import { teamErrorMessage } from '../utils/team-messages';

/** An action waiting for the admin's "yes". */
export type PendingConfirm = { kind: 'member'; member: TeamMember; action: MemberAction } | { kind: 'revoke'; invite: TeamInvite };

/** A link to show once, with the words for the dialog. */
export interface IssuedLink {
  issued: InviteIssued;
  title: string;
  recipient: string;
}

export interface Notice {
  severity: 'success' | 'error';
  text: string;
}

export interface TeamActions {
  confirm: PendingConfirm | null;
  confirmError: string | null;
  inviteError: string | null;
  inviteOpen: boolean;
  issued: IssuedLink | null;
  notice: Notice | null;
  pending: boolean;
  request: (member: TeamMember, action: MemberAction) => void;
  requestRevoke: (invite: TeamInvite) => void;
  /** Revoke and re-create an invitation; `sendEmail` also emails the new link (ignored when mail is off). */
  newLink: (invite: TeamInvite, sendEmail: boolean) => void;
  /** Whether the access-reset confirm dialog emails the link (the checkbox in it). */
  emailReset: boolean;
  setEmailReset: (value: boolean) => void;
  runConfirmed: () => void;
  cancelConfirm: () => void;
  openInvite: () => void;
  closeInvite: () => void;
  sendInvite: (body: CreateInviteRequest) => void;
  closeIssued: () => void;
  clearNotice: () => void;
}

/** Actions that need a confirm dialog before they run. */
const NEEDS_CONFIRM: readonly MemberAction[] = ['make-employee', 'deactivate', 'reset-access', 'reset-two-factor'];

/**
 * Everything the team screen can do and the little state around it (dialogs, notices). `onChanged` reloads the list;
 * `mailEnabled` is what the API said about email (no email option is offered, or sent, when it is off).
 */
export function useTeamActions(onChanged: () => void, mailEnabled = false): TeamActions {
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);
  const [emailReset, setEmailReset] = useState(true);

  const execute = async (item: PendingConfirm): Promise<void> => {
    if (item.kind === 'revoke') {
      await revokeInvite(item.invite.id);
      setNotice({ severity: 'success', text: `Invitation for ${item.invite.fullName} revoked` });
      return;
    }
    const { member, action } = item;
    if (action === 'reset-access') {
      const result = await resetAccess(member.id, mailEnabled && emailReset);
      setIssued({ issued: result, title: 'Access reset', recipient: member.email });
      setNotice({ severity: 'success', text: `${member.fullName} was signed out everywhere` });
      return;
    }
    if (action === 'reset-two-factor') {
      await resetTwoFactor(member.id);
      setNotice({ severity: 'success', text: `${member.fullName}'s two-factor was removed and they were signed out` });
      return;
    }
    const change = action === 'make-admin' ? { role: 'admin' as const } : action === 'make-employee' ? { role: 'employee' as const } : { active: action === 'reactivate' };
    await updateMember(member.id, change);
    const text: Record<Exclude<MemberAction, 'reset-access' | 'reset-two-factor'>, string> = {
      'make-admin': `${member.fullName} is now an admin`,
      'make-employee': `${member.fullName} is now an employee`,
      deactivate: `${member.fullName} was switched off`,
      reactivate: `${member.fullName} was switched back on`,
    };
    setNotice({ severity: 'success', text: text[action] });
  };

  const run = async (item: PendingConfirm, fromDialog: boolean): Promise<void> => {
    setPending(true);
    setConfirmError(null);
    try {
      await execute(item);
      setConfirm(null);
      onChanged();
    } catch (error: unknown) {
      const message = teamErrorMessage(error);
      if (fromDialog) {
        setConfirmError(message);
      } else {
        setNotice({ severity: 'error', text: message });
      }
    } finally {
      setPending(false);
    }
  };

  return {
    confirm,
    confirmError,
    inviteError,
    inviteOpen,
    issued,
    notice,
    pending,
    request: (member, action): void => {
      const item: PendingConfirm = { kind: 'member', member, action };
      if (NEEDS_CONFIRM.includes(action)) {
        setConfirmError(null);
        setEmailReset(true);
        setConfirm(item);
      } else {
        void run(item, false);
      }
    },
    requestRevoke: (invite): void => {
      setConfirmError(null);
      setConfirm({ kind: 'revoke', invite });
    },
    emailReset,
    setEmailReset,
    newLink: (invite, sendEmail): void => {
      // The old link can never be shown again, so replace it: revoke, then invite the same person again.
      setPending(true);
      revokeInvite(invite.id)
        .then(() => createInvite({ email: invite.email, fullName: invite.fullName, role: invite.role, ...(sendEmail && mailEnabled ? { sendEmail: true } : {}) }))
        .then((result): void => {
          setIssued({ issued: result, title: 'New link ready', recipient: invite.email });
          onChanged();
        })
        .catch((error: unknown): void => {
          setNotice({ severity: 'error', text: teamErrorMessage(error) });
          onChanged();
        })
        .finally((): void => setPending(false));
    },
    runConfirmed: (): void => {
      if (confirm !== null) {
        void run(confirm, true);
      }
    },
    cancelConfirm: (): void => setConfirm(null),
    openInvite: (): void => {
      setInviteError(null);
      setInviteOpen(true);
    },
    closeInvite: (): void => setInviteOpen(false),
    sendInvite: (body): void => {
      setPending(true);
      setInviteError(null);
      createInvite(body)
        .then((result): void => {
          setInviteOpen(false);
          setIssued({ issued: result, title: 'Invitation ready', recipient: body.email });
          onChanged();
        })
        .catch((error: unknown): void => setInviteError(teamErrorMessage(error)))
        .finally((): void => setPending(false));
    },
    closeIssued: (): void => setIssued(null),
    clearNotice: (): void => setNotice(null),
  };
}
