/**
 * @file apps/api/src/shared/audit/audit.repository.spec.ts
 * @shared SQL of the audit log: parameterized, organization-scoped, one statement per page
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { AuditRepository } from './audit.repository';

describe('AuditRepository', () => {
  const query = jest.fn<Promise<{ rows: unknown[]; rowCount: number | null }>, [string, ...unknown[]]>();
  let repository: AuditRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [AuditRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(AuditRepository);
  });

  it('inserts with parameters only and stores metadata as JSON', async () => {
    await repository.insert({
      organizationId: 'o1',
      staffUserId: 's1',
      action: 'org.settings_changed',
      targetType: 'organization',
      targetId: 'o1',
      metadata: { fields: ['iban', 'name'] },
      ipHash: 'h',
      requestId: 'r',
    });

    const [sql, params] = query.mock.calls[0] ?? ['', []];
    expect(sql).toContain('INSERT INTO audit_log');
    expect(sql).not.toContain('org.settings_changed');
    expect(params).toEqual(['o1', 's1', 'org.settings_changed', 'organization', 'o1', '{"fields":["iban","name"]}', 'h', 'r']);
  });

  it('defaults the optional parts to null and empty metadata', async () => {
    await repository.insert({ organizationId: null, staffUserId: null, action: 'auth.login_failed' });

    expect(query.mock.calls[0]?.[1]).toEqual([null, null, 'auth.login_failed', null, null, '{}', null, null]);
  });

  it('pages one organization in ONE statement, joining the staff name instead of looking each up', async () => {
    await repository.page({ organizationId: 'o1', actionPrefix: 'team.', staffUserId: null, from: null, to: null, after: null, limit: 50 });

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('a.organization_id = $1::uuid');
    expect(sql).toContain('LEFT JOIN staff_users');
    expect(sql).toContain('ORDER BY a.created_at DESC, a.id DESC');
    expect(sql).toContain('(a.created_at, a.id) < ($5::timestamptz, $6::uuid)');
  });

  it('filters by member inside the organization filter, as a parameter (never text in the SQL)', async () => {
    const member = '5f0c8c3e-0a8b-4d6e-9f55-2b8f1d4a7c11';
    await repository.page({ organizationId: 'o1', actionPrefix: null, staffUserId: member, from: null, to: null, after: null, limit: 50 });

    const [sql, params] = query.mock.calls[0] ?? ['', []];
    expect(sql).toContain('a.organization_id = $1::uuid');
    expect(sql).toContain('a.staff_user_id = $8::uuid');
    expect(sql).not.toContain(member);
    expect((params as unknown[])[7]).toBe(member);
  });

  it('asks for one more row than the page size, to know whether another page exists', async () => {
    await repository.page({ organizationId: 'o1', actionPrefix: null, staffUserId: null, from: null, to: null, after: null, limit: 50 });

    expect(query.mock.calls[0]?.[1]).toEqual(['o1', null, null, null, null, null, 51, null]);
  });

  it('reports hasMore and the last row\'s exact timestamp when the extra row came back', async () => {
    const row = (id: string, at: string): Record<string, unknown> => ({
      id,
      action: 'a.b',
      target_type: null,
      target_id: null,
      metadata: {},
      staff_user_id: null,
      staff_name: null,
      request_id: null,
      created_at_exact: at,
    });
    query.mockResolvedValue({
      rows: [row('id1', '2026-11-26T04:11:22.123456Z'), row('id2', '2026-11-26T04:11:21.000001Z'), row('id3', '2026-11-26T04:11:20.000000Z')],
      rowCount: 3,
    });

    const result = await repository.page({ organizationId: 'o1', actionPrefix: null, staffUserId: null, from: null, to: null, after: null, limit: 2 });

    expect(result.hasMore).toBe(true);
    expect(result.records.map((record) => record.id)).toEqual(['id1', 'id2']);
    expect(result.last).toEqual({ createdAt: '2026-11-26T04:11:21.000001Z', id: 'id2' });
    expect(result.records[0]?.createdAt).toBe('2026-11-26T04:11:22.123Z');
  });

  it('has no next page and no last row for an empty result', async () => {
    const result = await repository.page({ organizationId: 'o1', actionPrefix: null, staffUserId: null, from: null, to: null, after: null, limit: 10 });

    expect(result).toEqual({ records: [], last: null, hasMore: false });
  });
});
