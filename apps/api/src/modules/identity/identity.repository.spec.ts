/**
 * @file apps/api/src/modules/identity/identity.repository.spec.ts
 * @feature identity
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { IdentityRepository } from './identity.repository';

describe('IdentityRepository sessions', () => {
  const query = jest.fn<Promise<{ rows: unknown[]; rowCount: number | null }>, [string, ...unknown[]]>();
  let repository: IdentityRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [], rowCount: 2 });
    const moduleRef = await Test.createTestingModule({
      providers: [IdentityRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(IdentityRepository);
  });

  it('removes a person\'s other sessions in one statement and keeps the named one', async () => {
    await expect(repository.deleteSessionsExcept('s1', 'keep-hash')).resolves.toBe(2);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('staff_user_id = $1');
    expect(query.mock.calls[0]?.[0]).toContain('token_hash <> $2');
    expect(query.mock.calls[0]?.[1]).toEqual(['s1', 'keep-hash']);
  });

  it('removes every session of the person when none is kept', async () => {
    await repository.deleteSessionsExcept('s1', null);

    expect(query.mock.calls[0]?.[1]).toEqual(['s1', null]);
    expect(query.mock.calls[0]?.[0]).toContain('$2::text IS NULL');
  });

  it('purges sessions past their absolute end OR idle too long, and reports the count (zero when the driver gives none)', async () => {
    await expect(repository.purgeExpiredSessions(1800)).resolves.toBe(2);
    expect(query.mock.calls[0]?.[0]).toContain('expires_at <= now()');
    expect(query.mock.calls[0]?.[0]).toContain('last_used_at <= now()');
    expect(query.mock.calls[0]?.[1]).toEqual([1800]);

    query.mockResolvedValue({ rows: [], rowCount: null });
    await expect(repository.purgeExpiredSessions(1800)).resolves.toBe(0);
  });

  it('stores a new session with its device label and IP hash only', async () => {
    await repository.createSession('s1', 'hash', new Date('2030-01-01T00:00:00Z'), { label: 'Chrome on macOS', ipHash: 'iphash' });

    expect(query.mock.calls[0]?.[0]).toContain('device_label, created_ip_hash');
    expect(query.mock.calls[0]?.[1]).toEqual(['s1', 'hash', '2030-01-01T00:00:00.000Z', 'Chrome on macOS', 'iphash']);
  });

  it('refreshes last use only when the stored time is over a minute old (one write a minute at most)', async () => {
    await repository.touchSession('sess-1');

    expect(query.mock.calls[0]?.[0]).toContain("last_used_at < now() - interval '1 minute'");
    expect(query.mock.calls[0]?.[1]).toEqual(['sess-1']);
  });

  it('lists only the person\'s own live sessions, flags the current one by hash, and never selects the token hash out', async () => {
    query.mockResolvedValue({
      rows: [
        { id: 'a', device_label: 'Chrome on macOS', created_at: new Date('2030-01-01T08:00:00Z'), last_used_at: new Date('2030-01-01T09:00:00Z'), expires_at: new Date('2030-01-01T16:00:00Z'), current: true },
        { id: 'b', device_label: null, created_at: new Date('2030-01-01T07:00:00Z'), last_used_at: new Date('2030-01-01T07:30:00Z'), expires_at: new Date('2030-01-01T15:00:00Z'), current: false },
      ],
      rowCount: 2,
    });

    const sessions = await repository.listSessions('s1', 'cur-hash', 1800);

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('staff_user_id = $1');
    expect(sql).toContain('expires_at > now()');
    expect(sql).toContain('last_used_at > now()');
    expect(query.mock.calls[0]?.[1]).toEqual(['s1', 'cur-hash', 1800]);
    expect(sessions).toEqual([
      { id: 'a', deviceLabel: 'Chrome on macOS', createdAt: '2030-01-01T08:00:00.000Z', lastUsedAt: '2030-01-01T09:00:00.000Z', expiresAt: '2030-01-01T16:00:00.000Z', current: true },
      { id: 'b', deviceLabel: 'Unknown device', createdAt: '2030-01-01T07:00:00.000Z', lastUsedAt: '2030-01-01T07:30:00.000Z', expiresAt: '2030-01-01T15:00:00.000Z', current: false },
    ]);
    expect(JSON.stringify(sessions)).not.toContain('hash');
  });

  it('ends one session only when it belongs to the person: the owner is part of the DELETE', async () => {
    await expect(repository.deleteOwnSession('s1', 'sess-9')).resolves.toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain('id = $1 AND staff_user_id = $2');
    expect(query.mock.calls[0]?.[1]).toEqual(['sess-9', 's1']);

    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(repository.deleteOwnSession('s1', 'someone-elses')).resolves.toBe(false);
  });
});

describe('IdentityRepository accounts', () => {
  const query = jest.fn<Promise<{ rows: unknown[]; rowCount: number | null }>, [string, ...unknown[]]>();
  let repository: IdentityRepository;

  const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 's1',
    organization_id: 'o1',
    full_name: 'Ada',
    email: 'ada@example.com',
    password_hash: 'salt:hash',
    role: 'admin',
    active: true,
    can_manage_refunds: false,
    organization_name: 'Humphreys',
    session_id: 'sess-1',
    session_last_used_at: new Date('2030-01-01T09:00:00Z'),
    ...overrides,
  });

  async function liveStaff(hash: string): Promise<unknown> {
    return (await repository.findLiveSession(hash, 1800))?.staff;
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [row()], rowCount: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [IdentityRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(IdentityRepository);
  });

  it('finds the person behind a session only while their account is switched on, with role and workspace name in ONE statement', async () => {
    const live = await repository.findLiveSession('hash', 1800);
    const account = live?.staff;

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('s.expires_at > now()');
    expect(sql).toContain('s.last_used_at > now()');
    expect(query.mock.calls[0]?.[1]).toEqual(['hash', 1800]);
    expect(sql).toContain('u.active');
    expect(sql).toContain('INNER JOIN organizations o');
    expect(account).toEqual({
      id: 's1',
      organizationId: 'o1',
      fullName: 'Ada',
      email: 'ada@example.com',
      role: 'admin',
      organizationName: 'Humphreys',
      canManageRefunds: true,
    });
    // The password hash never leaves through a session lookup.
    expect(JSON.stringify(account)).not.toContain('salt:hash');
  });

  it('answers which session row it is and when it was last used', async () => {
    await expect(repository.findLiveSession('hash', 1800)).resolves.toMatchObject({
      sessionId: 'sess-1',
      lastUsedAt: new Date('2030-01-01T09:00:00Z'),
    });
  });

  it('reads the refund permission from the database on EVERY lookup (no cache), so a change applies at once', async () => {
    query.mockResolvedValueOnce({ rows: [row({ role: 'employee', can_manage_refunds: true })], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [row({ role: 'employee', can_manage_refunds: false })], rowCount: 1 });

    await expect(liveStaff('hash')).resolves.toMatchObject({ role: 'employee', canManageRefunds: true });
    await expect(liveStaff('hash')).resolves.toMatchObject({ role: 'employee', canManageRefunds: false });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain('u.can_manage_refunds');
  });

  it('an admin always has refund access, whatever the stored flag says; an employee only with the flag', async () => {
    query.mockResolvedValueOnce({ rows: [row({ role: 'admin', can_manage_refunds: false })], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [row({ role: 'employee', can_manage_refunds: false })], rowCount: 1 });

    await expect(liveStaff('a')).resolves.toMatchObject({ canManageRefunds: true });
    await expect(liveStaff('b')).resolves.toMatchObject({ canManageRefunds: false });
  });

  it('never turns an unknown role value into admin', async () => {
    query.mockResolvedValue({ rows: [row({ role: 'superuser' })], rowCount: 1 });

    await expect(liveStaff('hash')).resolves.toMatchObject({ role: 'employee' });
  });

  it('finds an account by email without regard to case, and reports its switched-on state for the sign-in', async () => {
    query.mockResolvedValue({ rows: [row({ active: false })], rowCount: 1 });

    const found = await repository.findStaffByEmail('  Ada@Example.COM ');

    expect(query.mock.calls[0]?.[0]).toContain('lower(u.email) = $1');
    expect(query.mock.calls[0]?.[1]).toEqual(['ada@example.com']);
    expect(found).toMatchObject({ active: false, passwordHash: 'salt:hash', role: 'admin' });
  });

  it('answers null when there is no such account', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(repository.findStaffByEmail('ghost@example.com')).resolves.toBeNull();
    await expect(repository.findStaffById('nobody')).resolves.toBeNull();
    await expect(repository.findLiveSession('nope', 1800)).resolves.toBeNull();
  });

  it('inserts an account as an admin by default (first start), with the given role otherwise, lower-casing the email', async () => {
    await repository.insertStaffUser('o1', 'Ada', 'Ada@Example.com', 'salt:hash');
    await repository.insertStaffUser('o1', 'Eve', 'eve@example.com', 'salt:hash', 'employee');

    expect(query.mock.calls[0]?.[1]).toEqual(['o1', 'Ada', 'ada@example.com', 'salt:hash', 'admin']);
    expect(query.mock.calls[1]?.[1]).toEqual(['o1', 'Eve', 'eve@example.com', 'salt:hash', 'employee']);
  });

  it('notes the last sign-in time of the account', async () => {
    await repository.touchLastLogin('s1');

    expect(query.mock.calls[0]?.[0]).toContain('SET last_login_at = now()');
    expect(query.mock.calls[0]?.[1]).toEqual(['s1']);
  });
});
