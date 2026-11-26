// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/team/components/compact-lists.test.tsx
 * @feature team
 * Phone layouts: members, invitations and the audit log become cards (no table).
 */

import type { AuditRecord, TeamInvite, TeamMember } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitesTable } from './invites-table';
import { MembersTable } from './members-table';

vi.mock('@/shared/hooks/use-compact-layout', () => ({ useCompactLayout: (): boolean => true, usePhoneLayout: (): boolean => true }));

const MEMBER: TeamMember = {
  id: 'm1',
  fullName: 'Marie Dupont',
  email: 'marie.with.a.very.long.address@humphreys-hospitality.example',
  role: 'admin',
  active: true,
  lastLoginAt: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  isYou: true,
};
const INVITE: TeamInvite = {
  id: 'i1',
  email: 'paul@humphreys.example',
  fullName: 'Paul Martin',
  role: 'employee',
  expiresAt: '2026-12-01T09:00:00.000Z',
  createdAt: '2026-11-24T09:00:00.000Z',
  createdByName: 'Marie Dupont',
  expired: false,
  isReset: false,
};
const RECORD: AuditRecord = {
  id: 'a1',
  action: 'team.invite_created',
  targetType: 'staff_invite',
  targetId: 'i1',
  metadata: { role: 'employee' },
  staffUserId: 's1',
  staffName: 'Marie Dupont',
  requestId: null,
  createdAt: '2026-11-25T09:30:00.000Z',
};

describe('phone layouts', () => {
  afterEach(cleanup);

  it('lists members as cards with the status, role and an actions menu', () => {
    const onAction = vi.fn();
    render(<MembersTable members={[MEMBER]} busy={false} onAction={onAction} />);

    expect(screen.queryByRole('table')).toBeNull();
    const list = within(screen.getByRole('list', { name: 'Team members' }));
    expect(list.getByText(MEMBER.email)).toBeTruthy();
    expect(list.getByText('Active')).toBeTruthy();
    expect(list.getByText(/\(you\)/)).toBeTruthy();
    fireEvent.click(list.getByRole('button', { name: 'Actions for Marie Dupont' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make employee' }));
    expect(onAction).toHaveBeenCalledWith(MEMBER, 'make-employee');
  });

  it('lists invitations as cards with Email / Copy / Revoke buttons', () => {
    const onNewLink = vi.fn();
    const onRevoke = vi.fn();
    render(<InvitesTable invites={[INVITE]} busy={false} mailEnabled onRevoke={onRevoke} onNewLink={onNewLink} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Waiting')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Email a new link to Paul Martin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy a new link for Paul Martin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation for Paul Martin' }));
    expect(onNewLink).toHaveBeenNthCalledWith(1, INVITE, true);
    expect(onNewLink).toHaveBeenNthCalledWith(2, INVITE, false);
    expect(onRevoke).toHaveBeenCalledWith(INVITE);
  });
});

describe('audit log on a phone', () => {
  afterEach(cleanup);

  it('shows entries as cards', async () => {
    vi.resetModules();
    vi.doMock('../services/team-api', () => ({ fetchAudit: vi.fn(() => Promise.resolve({ items: [RECORD], nextCursor: null })) }));
    const { AuditPage } = await import('./audit-page');
    render(<AuditPage />);

    const list = within(await screen.findByRole('list', { name: 'Audit log' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(list.getByText('Invited a team member')).toBeTruthy();
    expect(list.getByText('role: employee')).toBeTruthy();
    vi.doUnmock('../services/team-api');
  });
});
