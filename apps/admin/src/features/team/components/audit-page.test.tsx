// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/team/components/audit-page.test.tsx
 * @feature team
 */

import type { AuditPage as AuditPageData, AuditQuery, AuditRecord } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { AuditPage } from './audit-page';

const api = vi.hoisted(() => ({ fetchAudit: vi.fn<(query: AuditQuery) => Promise<AuditPageData>>() }));
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

describe('AuditPage', () => {
  beforeEach(() => {
    api.fetchAudit.mockReset();
    api.fetchAudit.mockResolvedValue({ items: [record()], nextCursor: null });
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
});
