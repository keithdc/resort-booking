// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/team/components/team-page.test.tsx
 * @feature team
 */

import type { InviteIssued, TeamInvite, TeamMember, TeamOverview } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { TeamPage } from './team-page';

const api = vi.hoisted(() => ({
  fetchTeam: vi.fn<() => Promise<TeamOverview>>(),
  createInvite: vi.fn<(body: object) => Promise<InviteIssued>>(),
  revokeInvite: vi.fn<(id: string) => Promise<null>>(),
  updateMember: vi.fn<(id: string, change: object) => Promise<TeamMember>>(),
  resetAccess: vi.fn<(id: string) => Promise<InviteIssued>>(),
  resetTwoFactor: vi.fn<(id: string) => Promise<null>>(),
}));

vi.mock('../services/team-api', () => api);
vi.mock('@resort-booking/ui/contact', () => ({
  isValidEmail: (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  EmailField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element => (
    <input aria-label={label} value={value} onChange={(event): void => onChange(event.target.value)} />
  ),
}));

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'm1',
    fullName: 'Marie Dupont',
    email: 'marie@atlantic.example',
    role: 'admin',
    active: true,
    lastLoginAt: '2026-11-25T09:30:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    canManageRefunds: true,
    isYou: true,
    ...overrides,
  };
}

function invite(overrides: Partial<TeamInvite> = {}): TeamInvite {
  return {
    id: 'i1',
    email: 'lena@atlantic.example',
    fullName: 'Lena Roche',
    role: 'employee',
    expiresAt: '2026-12-01T10:00:00.000Z',
    createdAt: '2026-11-24T10:00:00.000Z',
    createdByName: 'Marie Dupont',
    expired: false,
    isReset: false,
    canManageRefunds: false,
    ...overrides,
  };
}

const PAUL = member({ id: 'm2', fullName: 'Paul Martin', email: 'paul@atlantic.example', role: 'employee', lastLoginAt: null, canManageRefunds: false, isYou: false });
const OVERVIEW: TeamOverview = { members: [member(), PAUL], invites: [invite(), invite({ id: 'i2', fullName: 'Old Link', email: 'old@atlantic.example', expired: true })], mailEnabled: false };

function issued(token = 'f'.repeat(64)): InviteIssued {
  return { invite: invite(), inviteToken: token, expiresAt: '2026-12-01T10:00:00.000Z' };
}

async function openMenu(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
}

describe('TeamPage', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
    api.fetchTeam.mockResolvedValue(OVERVIEW);
  });
  afterEach(cleanup);

  it('lists members with role, status and last sign-in, and the pending invitations', async () => {
    render(<TeamPage />);

    const members = within(await screen.findByRole('table', { name: 'Team members' }));
    expect(members.getByText(/Marie Dupont/)).toBeTruthy();
    expect(members.getByText('(you)')).toBeTruthy();
    expect(members.getByText('Admin')).toBeTruthy();
    expect(members.getByText('Employee')).toBeTruthy();
    expect(members.getAllByText('Active')).toHaveLength(2);
    expect(members.getByText('Never')).toBeTruthy();
    const invites = within(screen.getByRole('table', { name: 'Pending invitations' }));
    expect(invites.getByText('Lena Roche')).toBeTruthy();
    expect(invites.getByText('Waiting')).toBeTruthy();
    expect(invites.getByText('Expired')).toBeTruthy();
  });

  it('shows an empty state when there are no pending invitations', async () => {
    api.fetchTeam.mockResolvedValue({ members: [member()], invites: [], mailEnabled: false });

    render(<TeamPage />);

    expect(await screen.findByText('No pending invitations')).toBeTruthy();
  });

  it('shows an error with a retry when the team cannot be loaded', async () => {
    api.fetchTeam.mockRejectedValueOnce(new ApiRequestError('Boom', 500));

    render(<TeamPage />);

    expect(await screen.findByText('Boom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Team members' })).toBeTruthy();
  });

  it('does not offer you to switch yourself off or reset your own access', async () => {
    render(<TeamPage />);

    await openMenu('Marie Dupont');

    expect(screen.getByRole('menuitem', { name: 'Make employee' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Switch off' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Reset access' })).toBeNull();
  });

  it('makes someone admin straight away (no confirmation) and reloads', async () => {
    api.updateMember.mockResolvedValue({ ...PAUL, role: 'admin' });
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make admin' }));

    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('m2', { role: 'admin' }));
    expect(await screen.findByText('Paul Martin is now an admin')).toBeTruthy();
    expect(api.fetchTeam).toHaveBeenCalledTimes(2);
  });

  it('shows full access for admins, refund access for an employee who has it, and policy-only for the rest', async () => {
    const tia = member({ id: 'm3', fullName: 'Tia Roy', email: 'tia@atlantic.example', role: 'employee', canManageRefunds: true, isYou: false });
    api.fetchTeam.mockResolvedValue({ members: [member(), PAUL, tia], invites: [], mailEnabled: false });
    render(<TeamPage />);

    const members = within(await screen.findByRole('table', { name: 'Team members' }));

    expect(members.getAllByText('Full access')).toHaveLength(1);
    expect(members.getAllByText('Refund access')).toHaveLength(1);
    expect(members.getAllByText('Policy refunds only')).toHaveLength(1);
  });

  it('offers "Give refund access" to an employee without it and not to yourself or an admin', async () => {
    render(<TeamPage />);

    await openMenu('Paul Martin');
    expect(screen.getByRole('menuitem', { name: 'Give refund access' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Remove refund access' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    cleanup();

    api.fetchTeam.mockResolvedValue(OVERVIEW);
    render(<TeamPage />);
    await openMenu('Marie Dupont');
    expect(screen.queryByRole('menuitem', { name: /refund access/i })).toBeNull();
  });

  it('asks first, says what changes, then grants refund access and reloads', async () => {
    api.updateMember.mockResolvedValue({ ...PAUL, canManageRefunds: true });
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Give refund access' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Give Paul Martin refund access?')).toBeTruthy();
    expect(dialog.getByText(/retry failed refunds, mark hand refunds as paid, mark pay-at-hotel bookings as paid, see revenue, refunds and amounts in Reports, choose any refund amount/)).toBeTruthy();
    expect(dialog.getByText(/recorded in the audit log with their name/)).toBeTruthy();
    expect(api.updateMember).not.toHaveBeenCalled();

    fireEvent.click(dialog.getByRole('button', { name: 'Give refund access' }));

    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('m2', { canManageRefunds: true }));
    expect(await screen.findByText('Paul Martin can now handle refunds and money actions')).toBeTruthy();
    expect(api.fetchTeam).toHaveBeenCalledTimes(2);
  });

  it('asks first, says what is lost, then removes refund access', async () => {
    const tia = member({ id: 'm3', fullName: 'Tia Roy', email: 'tia@atlantic.example', role: 'employee', canManageRefunds: true, isYou: false });
    api.fetchTeam.mockResolvedValue({ members: [member(), tia], invites: [], mailEnabled: false });
    api.updateMember.mockResolvedValue({ ...tia, canManageRefunds: false });
    render(<TeamPage />);

    await openMenu('Tia Roy');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove refund access' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/policy refunds only/)).toBeTruthy();
    expect(dialog.getByText(/no refund/)).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Remove refund access' }));

    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('m3', { canManageRefunds: false }));
    expect(await screen.findByText('Tia Roy can no longer handle refunds and money actions')).toBeTruthy();
  });

  it('keeps the dialog open and explains when the API refuses the change', async () => {
    api.updateMember.mockRejectedValue(new ApiRequestError('raw server text', 400, { code: 'REFUND_ACCESS_NOT_FOR_ADMIN' }));
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Give refund access' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Give refund access' }));

    expect(await within(screen.getByRole('dialog')).findByText('Admins always have refund access. It can only be given to employees.')).toBeTruthy();
  });

  it('asks before switching a person off, then does it', async () => {
    api.updateMember.mockResolvedValue({ ...PAUL, active: false });
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }));
    expect(api.updateMember).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Switch off Paul Martin?')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Switch off' }));

    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('m2', { active: false }));
    expect(await screen.findByText('Paul Martin was switched off')).toBeTruthy();
  });

  it('can be cancelled without changing anything', async () => {
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.updateMember).not.toHaveBeenCalled();
  });

  it('explains the last-admin refusal inside the dialog and keeps it open', async () => {
    const only = member({ id: 'm9', fullName: 'Solo Admin', isYou: false });
    api.fetchTeam.mockResolvedValue({ members: [only], invites: [], mailEnabled: false });
    api.updateMember.mockRejectedValue(new ApiRequestError('The workspace needs at least one active admin', 409, { code: 'LAST_ADMIN' }));
    render(<TeamPage />);

    await openMenu('Solo Admin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Switch off' }));

    expect(await screen.findByText(/only active admin/)).toBeTruthy();
    expect(screen.getByText(/Make someone else an admin first/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows the last-admin refusal for demotion too', async () => {
    api.updateMember.mockRejectedValue(new ApiRequestError('The workspace needs at least one active admin', 409, { code: 'LAST_ADMIN' }));
    render(<TeamPage />);

    await openMenu('Marie Dupont');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make employee' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make employee' }));

    expect(await screen.findByText(/Make someone else an admin first/)).toBeTruthy();
  });

  it('switches a person back on without a dialog', async () => {
    const off = { ...PAUL, active: false };
    api.fetchTeam.mockResolvedValue({ members: [member(), off], invites: [], mailEnabled: false });
    api.updateMember.mockResolvedValue(PAUL);
    render(<TeamPage />);

    await openMenu('Paul Martin');
    expect(screen.queryByRole('menuitem', { name: 'Reset access' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch back on' }));

    await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('m2', { active: true }));
  });

  it('confirms an access reset and then shows the one-time link', async () => {
    api.resetAccess.mockResolvedValue(issued('c'.repeat(64)));
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset access' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset access' }));

    const link = (await screen.findByLabelText('One-time link')) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/invite#token=${'c'.repeat(64)}`);
    expect(api.resetAccess).toHaveBeenCalledWith('m2', false);
  });

  it('confirms before removing a member\'s two-factor', async () => {
    api.resetTwoFactor.mockResolvedValue(null);
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset two-factor' }));
    expect(api.resetTwoFactor).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset two-factor' }));

    await waitFor(() => expect(api.resetTwoFactor).toHaveBeenCalledWith('m2'));
    expect(await screen.findByText(/two-factor was removed/)).toBeTruthy();
  });

  it('replaces a lost invitation link with a new one', async () => {
    api.revokeInvite.mockResolvedValue(null);
    api.createInvite.mockResolvedValue(issued('d'.repeat(64)));
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Get a new link for Lena Roche' }));

    const link = (await screen.findByLabelText('One-time link')) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/invite#token=${'d'.repeat(64)}`);
    expect(api.revokeInvite).toHaveBeenCalledWith('i1');
    expect(api.createInvite).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Lena Roche' }));
  });

  it('keeps the refund permission of the invitation when its lost link is replaced', async () => {
    api.fetchTeam.mockResolvedValue({ ...OVERVIEW, invites: [invite({ canManageRefunds: true })] });
    api.revokeInvite.mockResolvedValue(null);
    api.createInvite.mockResolvedValue(issued('e'.repeat(64)));
    render(<TeamPage />);

    expect(await screen.findByText('Refund access')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Get a new link for Lena Roche' }));

    await waitFor(() => expect(api.createInvite).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Lena Roche', canManageRefunds: true })));
  });

  it('confirms before revoking an invitation', async () => {
    api.revokeInvite.mockResolvedValue(null);
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation for Lena Roche' }));
    expect(api.revokeInvite).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke invitation' }));

    await waitFor(() => expect(api.revokeInvite).toHaveBeenCalledWith('i1'));
    expect(await screen.findByText('Invitation for Lena Roche revoked')).toBeTruthy();
  });
});

describe('TeamPage invite flow', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    api.fetchTeam.mockResolvedValue(OVERVIEW);
  });
  afterEach(cleanup);

  async function sendInvite(): Promise<void> {
    fireEvent.click(await screen.findByRole('button', { name: 'Invite someone' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: 'Nora Vidal' } });
    fireEvent.change(dialog.getByLabelText('Email'), { target: { value: 'nora@atlantic.example' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Create invitation link' }));
  }

  it('shows the refund-access checkbox (off by default, with what it allows) for an employee invite only', async () => {
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Invite someone' }));
    const dialog = within(screen.getByRole('dialog'));
    const box = dialog.getByRole('checkbox', { name: /Can handle refunds and money actions/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(dialog.getByText(/recorded in the audit log with their name/)).toBeTruthy();

    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Role' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Admin'));

    expect(screen.queryByRole('checkbox', { name: /Can handle refunds and money actions/ })).toBeNull();
  });

  it('sends canManageRefunds: true when the box is ticked for an employee', async () => {
    api.createInvite.mockResolvedValue(issued('a'.repeat(64)));
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Invite someone' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: 'Nora Vidal' } });
    fireEvent.change(dialog.getByLabelText('Email'), { target: { value: 'nora@atlantic.example' } });
    fireEvent.click(dialog.getByRole('checkbox', { name: /Can handle refunds and money actions/ }));
    fireEvent.click(dialog.getByRole('button', { name: 'Create invitation link' }));

    await waitFor(() =>
      expect(api.createInvite).toHaveBeenCalledWith({ email: 'nora@atlantic.example', fullName: 'Nora Vidal', role: 'employee', canManageRefunds: true }),
    );
  });

  it('keeps the invite button off until name and a valid email are entered', async () => {
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Invite someone' }));
    const dialog = within(screen.getByRole('dialog'));
    const submit = dialog.getByRole('button', { name: 'Create invitation link' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: 'Nora Vidal' } });
    fireEvent.change(dialog.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText('Email'), { target: { value: 'nora@atlantic.example' } });
    expect(submit.disabled).toBe(false);
  });

  it('creates the invitation as an employee by default and shows the link once with a warning', async () => {
    api.createInvite.mockResolvedValue(issued('a'.repeat(64)));
    render(<TeamPage />);

    await sendInvite();

    expect(api.createInvite).toHaveBeenCalledWith({ email: 'nora@atlantic.example', fullName: 'Nora Vidal', role: 'employee' });
    const link = (await screen.findByLabelText('One-time link')) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/invite#token=${'a'.repeat(64)}`);
    expect(screen.getByText(/only time you will see the link/)).toBeTruthy();
  });

  it('copies the link with the copy button and says so', async () => {
    api.createInvite.mockResolvedValue(issued('a'.repeat(64)));
    render(<TeamPage />);
    await sendInvite();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite#token=${'a'.repeat(64)}`));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('tells the person to copy by hand when the browser blocks the clipboard', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    api.createInvite.mockResolvedValue(issued());
    render(<TeamPage />);
    await sendInvite();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText(/blocked copying/)).toBeTruthy();
  });

  it('forgets the link once the dialog is closed: it is not in the page any more', async () => {
    const token = 'b'.repeat(64);
    api.createInvite.mockResolvedValue(issued(token));
    render(<TeamPage />);
    await sendInvite();
    await screen.findByLabelText('One-time link');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByLabelText('One-time link')).toBeNull());
    expect(document.body.innerHTML).not.toContain(token);
  });

  it('shows the API error inside the invite dialog and keeps what was typed', async () => {
    api.createInvite.mockRejectedValue(new ApiRequestError('An account with this email already exists. Sign in instead.', 409, { code: 'EMAIL_TAKEN' }));
    render(<TeamPage />);

    await sendInvite();

    expect(await screen.findByText(/already has an account/)).toBeTruthy();
    expect((within(screen.getByRole('dialog')).getByLabelText('Email') as HTMLInputElement).value).toBe('nora@atlantic.example');
  });
});

describe('TeamPage with email set up', () => {
  const MAIL_OVERVIEW: TeamOverview = { ...OVERVIEW, mailEnabled: true };

  beforeEach(() => {
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    api.fetchTeam.mockResolvedValue(MAIL_OVERVIEW);
  });
  afterEach(cleanup);

  async function fillInvite(): Promise<ReturnType<typeof within>> {
    fireEvent.click(await screen.findByRole('button', { name: 'Invite someone' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: 'Nora Vidal' } });
    fireEvent.change(dialog.getByLabelText('Email'), { target: { value: 'nora@atlantic.example' } });
    return dialog;
  }

  it('offers "Email the link to them", ticked by default, and asks the API to send it', async () => {
    api.createInvite.mockResolvedValue({ ...issued(), emailStatus: 'sent' });
    render(<TeamPage />);

    const dialog = await fillInvite();
    expect((dialog.getByLabelText('Email the link to them') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(dialog.getByRole('button', { name: 'Invite and email link' }));

    await waitFor(() => expect(api.createInvite).toHaveBeenCalledWith({ email: 'nora@atlantic.example', fullName: 'Nora Vidal', role: 'employee', sendEmail: true }));
    expect(await screen.findByText('Email sent to nora@atlantic.example.')).toBeTruthy();
    expect(screen.getByLabelText('One-time link')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  it('does not ask for an email when the box is unticked: just the link', async () => {
    api.createInvite.mockResolvedValue(issued());
    render(<TeamPage />);

    const dialog = await fillInvite();
    fireEvent.click(dialog.getByLabelText('Email the link to them'));
    fireEvent.click(dialog.getByRole('button', { name: 'Create invitation link' }));

    await waitFor(() => expect(api.createInvite).toHaveBeenCalledWith({ email: 'nora@atlantic.example', fullName: 'Nora Vidal', role: 'employee' }));
    await screen.findByLabelText('One-time link');
    expect(screen.queryByText(/Email sent to/)).toBeNull();
  });

  it('says to copy the link when the email could not be sent, and still shows the link', async () => {
    api.createInvite.mockResolvedValue({ ...issued(), emailStatus: 'failed' });
    render(<TeamPage />);

    const dialog = await fillInvite();
    fireEvent.click(dialog.getByRole('button', { name: 'Invite and email link' }));

    expect(await screen.findByText(/We could not send the email. Copy the link below and send it yourself/)).toBeTruthy();
    expect(screen.getByLabelText('One-time link')).toBeTruthy();
  });

  it('says email is not set up when the API answers not_configured', async () => {
    api.createInvite.mockResolvedValue({ ...issued(), emailStatus: 'not_configured' });
    render(<TeamPage />);

    const dialog = await fillInvite();
    fireEvent.click(dialog.getByRole('button', { name: 'Invite and email link' }));

    expect(await screen.findByText(/Email is not set up. Copy the link below/)).toBeTruthy();
  });

  it('"Email new link" revokes, re-creates with sendEmail and shows the status', async () => {
    api.revokeInvite.mockResolvedValue(null);
    api.createInvite.mockResolvedValue({ ...issued('e'.repeat(64)), emailStatus: 'sent' });
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Email a new link to Lena Roche' }));

    await screen.findByText('Email sent to lena@atlantic.example.');
    expect(api.revokeInvite).toHaveBeenCalledWith('i1');
    expect(api.createInvite).toHaveBeenCalledWith({ email: 'lena@atlantic.example', fullName: 'Lena Roche', role: 'employee', sendEmail: true });
  });

  it('"Copy new link" revokes and re-creates WITHOUT emailing', async () => {
    api.revokeInvite.mockResolvedValue(null);
    api.createInvite.mockResolvedValue(issued('f'.repeat(64)));
    render(<TeamPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy a new link for Lena Roche' }));

    await screen.findByLabelText('One-time link');
    expect(api.createInvite).toHaveBeenCalledWith({ email: 'lena@atlantic.example', fullName: 'Lena Roche', role: 'employee' });
  });

  it('an access reset offers the email option (ticked) and sends it', async () => {
    api.resetAccess.mockResolvedValue({ ...issued(), emailStatus: 'sent' });
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset access' }));
    const dialog = within(screen.getByRole('dialog'));
    expect((dialog.getByLabelText('Email the link to them') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(dialog.getByRole('button', { name: 'Reset access' }));

    expect(await screen.findByText('Email sent to paul@atlantic.example.')).toBeTruthy();
    expect(api.resetAccess).toHaveBeenCalledWith('m2', true);
  });

  it('an access reset with the box unticked only returns the link', async () => {
    api.resetAccess.mockResolvedValue(issued());
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset access' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByLabelText('Email the link to them'));
    fireEvent.click(dialog.getByRole('button', { name: 'Reset access' }));

    await screen.findByLabelText('One-time link');
    expect(api.resetAccess).toHaveBeenCalledWith('m2', false);
  });

  it('does not offer the email option on other confirm dialogs', async () => {
    render(<TeamPage />);

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }));

    expect(within(screen.getByRole('dialog')).queryByLabelText('Email the link to them')).toBeNull();
  });
});

describe('TeamPage without email set up', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
    api.fetchTeam.mockResolvedValue(OVERVIEW);
  });
  afterEach(cleanup);

  it('shows no dead email checkbox in the invite or reset dialogs, and no "Email new link" button', async () => {
    render(<TeamPage />);

    expect(await screen.findByRole('button', { name: 'Get a new link for Lena Roche' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Email a new link/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Invite someone' }));
    expect(within(screen.getByRole('dialog')).queryByLabelText('Email the link to them')).toBeNull();
    expect(within(screen.getByRole('dialog')).getByText(/Email is not set up/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openMenu('Paul Martin');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset access' }));
    expect(within(screen.getByRole('dialog')).queryByLabelText('Email the link to them')).toBeNull();
  });
});
