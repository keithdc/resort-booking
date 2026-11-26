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

  it('purges expired sessions and reports the count (zero when the driver gives none)', async () => {
    await expect(repository.purgeExpiredSessions()).resolves.toBe(2);
    expect(query.mock.calls[0]?.[0]).toContain('expires_at <= now()');

    query.mockResolvedValue({ rows: [], rowCount: null });
    await expect(repository.purgeExpiredSessions()).resolves.toBe(0);
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
    organization_name: 'Humphreys',
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [row()], rowCount: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [IdentityRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(IdentityRepository);
  });

  it('finds the person behind a session only while their account is switched on, with role and workspace name in ONE statement', async () => {
    const account = await repository.findStaffBySessionTokenHash('hash');

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('s.expires_at > now()');
    expect(sql).toContain('u.active');
    expect(sql).toContain('INNER JOIN organizations o');
    expect(account).toEqual({
      id: 's1',
      organizationId: 'o1',
      fullName: 'Ada',
      email: 'ada@example.com',
      role: 'admin',
      organizationName: 'Humphreys',
    });
    // The password hash never leaves through a session lookup.
    expect(JSON.stringify(account)).not.toContain('salt:hash');
  });

  it('never turns an unknown role value into admin', async () => {
    query.mockResolvedValue({ rows: [row({ role: 'superuser' })], rowCount: 1 });

    await expect(repository.findStaffBySessionTokenHash('hash')).resolves.toMatchObject({ role: 'employee' });
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
    await expect(repository.findStaffBySessionTokenHash('nope')).resolves.toBeNull();
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
