// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/team/components/audit-page.test.tsx
 * @feature team
 */

import type { AuditPage as AuditPageData, AuditQuery, AuditRecord, TeamMember, TeamOverview } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { AuditPage } from './audit-page';

const api = vi.hoisted(() => ({
  fetchAudit: vi.fn<(query: AuditQuery) => Promise<AuditPageData>>(),
  fetchTeam: vi.fn<() => Promise<TeamOverview>>(),
}));
vi.mock('../services/team-api', () => api);

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: 'a1',
    action: 'team.invite_created',
    targetType: 'staff_invite',
    targetId: 'i1',
    metadata: { role: 'employee' },
    staffUserId: 's1',
    staffName: 'Marie Dupont',
    requestId: null,
    createdAt: '2026-11-25T09:30:00.000Z',
    ...overrides,
  };
}

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: '5f0c8c3e-0a8b-4d6e-9f55-2b8f1d4a7c11',
    fullName: 'Marie Dupont',
    email: 'marie@example.com',
    role: 'employee',
    active: true,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    canManageRefunds: false,
    isYou: false,
    ...overrides,
  };
}

const ZOE = member({ id: '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', fullName: 'Zoe Admin', role: 'admin', canManageRefunds: true, isYou: true });
const OFF = member({ id: '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a', fullName: 'Old Timer', active: false });

describe('AuditPage', () => {
  beforeEach(() => {
    api.fetchAudit.mockReset();
    api.fetchAudit.mockResolvedValue({ items: [record()], nextCursor: null });
    api.fetchTeam.mockReset();
    api.fetchTeam.mockResolvedValue({ members: [ZOE, member(), OFF], invites: [], mailEnabled: false });
  });
  afterEach(cleanup);

  it('shows who did what in plain words, with the details', async () => {
    render(<AuditPage />);

    const table = within(await screen.findByRole('table', { name: 'Audit log' }));
    expect(table.getByText('Marie Dupont')).toBeTruthy();
    expect(table.getByText('Invited a team member')).toBeTruthy();
    expect(table.getByText('team.invite_created')).toBeTruthy();
    expect(table.getByText('role: employee')).toBeTruthy();
    expect(api.fetchAudit).toHaveBeenCalledWith({ limit: 25 });
  });

  it('names an unknown visitor for a failed sign-in', async () => {
    api.fetchAudit.mockResolvedValue({ items: [record({ action: 'auth.login_failed', staffName: null, staffUserId: null, metadata: {} })], nextCursor: null });

    render(<AuditPage />);

    expect(await screen.findByText('Unknown visitor')).toBeTruthy();
    expect(screen.getByText('Failed sign-in attempt')).toBeTruthy();
  });

  it('filters by kind of action using the API prefix', async () => {
    render(<AuditPage />);
    await screen.findByRole('table', { name: 'Audit log' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'What happened' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Team and invitations' }));

    await waitFor(() => expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25, action: 'team.' }));
  });

  it('filters by date and sends the day after "To" because the API end is exclusive', async () => {
    render(<AuditPage />);
    await screen.findByRole('table', { name: 'Audit log' });

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-30' } });

    await waitFor(() => expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25, from: '2026-11-01', to: '2026-12-01' }));
    expect(screen.getByLabelText('To').getAttribute('min')).toBe('2026-11-01');
  });

  it('clears the filters', async () => {
    render(<AuditPage />);
    await screen.findByRole('table', { name: 'Audit log' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

    await waitFor(() => expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25 }));
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('');
  });

  it('loads older entries with the cursor and appends them', async () => {
    api.fetchAudit.mockResolvedValueOnce({ items: [record()], nextCursor: 'cur-1' });
    api.fetchAudit.mockResolvedValueOnce({ items: [record({ id: 'a2', action: 'refund.marked_paid', metadata: {} })], nextCursor: null });
    render(<AuditPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Load older entries' }));

    expect(await screen.findByText('Marked a refund as paid')).toBeTruthy();
    expect(screen.getByText('Invited a team member')).toBeTruthy();
    expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25, cursor: 'cur-1' });
    expect(screen.queryByRole('button', { name: 'Load older entries' })).toBeNull();
  });

  it('shows an empty state, different when filters are on', async () => {
    api.fetchAudit.mockResolvedValue({ items: [], nextCursor: null });
    render(<AuditPage />);

    expect(await screen.findByText('No activity recorded yet')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    expect(await screen.findByText('Nothing matches these filters')).toBeTruthy();
  });

  it('shows the error with a retry', async () => {
    api.fetchAudit.mockRejectedValueOnce(new ApiRequestError('Only admins can do this.', 403));
    render(<AuditPage />);

    expect(await screen.findByText('Only admins can do this.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Audit log' })).toBeTruthy();
  });

  describe('member filter', () => {
    async function openMembers(): Promise<HTMLElement> {
      render(<AuditPage />);
      await screen.findByRole('table', { name: 'Audit log' });
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Member' }));
      return screen.findByRole('listbox');
    }

    it('lists Everyone first, then every member from the Team page by name, switched-off people too', async () => {
      const list = within(await openMembers());
      await waitFor(() => expect(list.getAllByRole('option')).toHaveLength(4));

      expect(list.getAllByRole('option').map((option) => option.textContent)).toEqual(['Everyone', 'Marie Dupont', 'Old Timer (switched off)', 'Zoe Admin (you)']);
    });

    it('asks the API for just that member, and Everyone removes the filter', async () => {
      const list = within(await openMembers());
      fireEvent.click(await list.findByRole('option', { name: 'Marie Dupont' }));

      await waitFor(() => expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25, member: '5f0c8c3e-0a8b-4d6e-9f55-2b8f1d4a7c11' }));

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Member' }));
      fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Everyone' }));
      await waitFor(() => expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25 }));
    });

    it('works together with the other filters, and Clear filters resets it', async () => {
      const list = within(await openMembers());
      fireEvent.click(await list.findByRole('option', { name: 'Marie Dupont' }));
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });

      await waitFor(() =>
        expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25, member: '5f0c8c3e-0a8b-4d6e-9f55-2b8f1d4a7c11', from: '2026-11-01' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      await waitFor(() => expect(api.fetchAudit).toHaveBeenLastCalledWith({ limit: 25 }));
    });

    it('says nothing matches when the chosen member has done nothing', async () => {
      api.fetchAudit.mockResolvedValueOnce({ items: [record()], nextCursor: null });
      api.fetchAudit.mockResolvedValue({ items: [], nextCursor: null });
      const list = within(await openMembers());
      fireEvent.click(await list.findByRole('option', { name: 'Old Timer (switched off)' }));

      expect(await screen.findByText('Nothing matches these filters')).toBeTruthy();
    });

    it('still shows the log, with only Everyone to choose, when the team cannot be loaded', async () => {
      api.fetchTeam.mockRejectedValue(new ApiRequestError('Only admins can do this.', 403));
      const list = within(await openMembers());

      expect(list.getAllByRole('option').map((option) => option.textContent)).toEqual(['Everyone']);
      // The open list hides the page from the accessibility tree, so look past that.
      expect(screen.getByRole('table', { name: 'Audit log', hidden: true })).toBeTruthy();
    });
  });
});
