/**
 * @file apps/api/src/shared/audit/audit.service.spec.ts
 * @shared The audit log: writing never throws, reading is paged, scoped and validated
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import { runWithRequestContext } from '../http/request-context';
import { AuditRepository, type AuditQuery } from './audit.repository';
import { AuditService } from './audit.service';
import type { AuditEntry, AuditRecord } from './audit.types';

const ORG = '11111111-1111-4111-8111-111111111111';
const ROW_ID = '22222222-2222-4222-8222-222222222222';
const EXACT = '2026-11-26T04:11:22.123456Z';

function record(): AuditRecord {
  return {
    id: ROW_ID,
    action: 'team.invite_created',
    targetType: 'staff_invite',
    targetId: 'i1',
    metadata: {},
    staffUserId: 's1',
    staffName: 'Ada',
    requestId: 'req-1',
    createdAt: '2026-11-26T04:11:22.123Z',
  };
}

describe('AuditService', () => {
  const insert = jest.fn<Promise<void>, [AuditEntry]>();
  const insertWith = jest.fn<Promise<void>, [PoolClient, AuditEntry]>();
  const page = jest.fn<Promise<{ records: AuditRecord[]; last: { createdAt: string; id: string } | null; hasMore: boolean }>, [AuditQuery]>();
  const errors: string[] = [];
  let service: AuditService;

  beforeEach(async () => {
    jest.resetAllMocks();
    errors.length = 0;
    jest.spyOn(Logger.prototype, 'error').mockImplementation((...args: unknown[]): void => {
      errors.push(String(args[0]));
    });
    insert.mockResolvedValue(undefined);
    insertWith.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AuditRepository, useValue: { insert, insertWith, page } },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => (name === 'IP_HASH_SALT' ? 'pepper' : undefined) } },
      ],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('recordInTransaction', () => {
    const client = Object.create(null) as PoolClient;

    it('writes on the caller\'s transaction client, with the request\'s network (hashed) and id', async () => {
      await runWithRequestContext({ ip: '203.0.113.9', requestId: 'req-77' }, () =>
        service.recordInTransaction(client, { organizationId: ORG, staffUserId: 's1' }, 'booking.marked_paid', { targetType: 'booking', targetId: 'b1', metadata: { paidCents: 100 } }),
      );

      expect(insertWith).toHaveBeenCalledTimes(1);
      const [usedClient, entry] = insertWith.mock.calls[0] ?? [];
      expect(usedClient).toBe(client);
      expect(entry).toMatchObject({ organizationId: ORG, staffUserId: 's1', action: 'booking.marked_paid', targetType: 'booking', targetId: 'b1', requestId: 'req-77' });
      expect(entry?.ipHash).toMatch(/^[0-9a-f]+$/);
      expect(JSON.stringify(entry)).not.toContain('203.0.113.9');
      expect(insert).not.toHaveBeenCalled();
    });

    it('works outside a request: no network and no request id', async () => {
      await service.recordInTransaction(client, { organizationId: ORG, staffUserId: 's1' }, 'team.role_changed');

      expect(insertWith.mock.calls[0]?.[1]).toMatchObject({ ipHash: null, requestId: null });
    });

    it('THROWS when the row cannot be written, so the caller\'s transaction rolls back (unlike record)', async () => {
      insertWith.mockRejectedValue(new Error('disk full'));

      await expect(service.recordInTransaction(client, { organizationId: ORG, staffUserId: 's1' }, 'booking.marked_paid')).rejects.toThrow('disk full');
      expect(errors).toEqual([]);
    });
  });

  describe('record', () => {
    it('writes the row and says so', async () => {
      const entry: AuditEntry = { organizationId: ORG, staffUserId: 's1', action: 'auth.login' };

      await expect(service.record(entry)).resolves.toBe(true);

      expect(insert).toHaveBeenCalledWith(entry);
    });

    it('NEVER throws: a failing database only logs, and the log holds no details of the entry', async () => {
      insert.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.record({ organizationId: ORG, staffUserId: 's1', action: 'refund.marked_paid', metadata: { note: 'secret-detail' } }),
      ).resolves.toBe(false);

      expect(errors.join('\n')).toContain('refund.marked_paid');
      expect(errors.join('\n')).toContain('connection lost');
      expect(errors.join('\n')).not.toContain('secret-detail');
    });
  });

  describe('recordBy', () => {
    it('stamps the organization, the person, the request id and a HASH of the IP (never the address)', async () => {
      await service.recordBy({ organizationId: ORG, staffUserId: 's1', ip: '203.0.113.7', requestId: 'req-9' }, 'team.deactivated', {
        targetType: 'staff_user',
        targetId: 's2',
      });

      const written = insert.mock.calls[0]?.[0];
      expect(written).toMatchObject({
        organizationId: ORG,
        staffUserId: 's1',
        action: 'team.deactivated',
        targetType: 'staff_user',
        targetId: 's2',
        requestId: 'req-9',
      });
      expect(written?.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(written)).not.toContain('203.0.113.7');
    });

    it('hashes the same IP the same way each time, and differently with another salt', async () => {
      expect(service.hashIp('203.0.113.7')).toBe(service.hashIp('203.0.113.7'));
      expect(service.hashIp('203.0.113.7')).not.toBe(service.hashIp('203.0.113.8'));
      expect(service.hashEmail('Ada@Example.com')).toBe(service.hashEmail(' ada@example.com '));
    });

    it('records no IP hash when the address is unknown', async () => {
      await service.recordBy({ organizationId: ORG, staffUserId: 's1', ip: undefined, requestId: undefined }, 'auth.logout_all');

      expect(insert.mock.calls[0]?.[0]).toMatchObject({ ipHash: null, requestId: null });
    });
  });

  describe('list', () => {
    it('reads only the given organization, newest first, 50 at a time by default', async () => {
      page.mockResolvedValue({ records: [record()], last: { createdAt: EXACT, id: ROW_ID }, hasMore: false });

      const result = await service.list(ORG, {});

      expect(page).toHaveBeenCalledWith({ organizationId: ORG, actionPrefix: null, staffUserId: null, from: null, to: null, after: null, limit: 50 });
      expect(result).toEqual({ items: [record()], nextCursor: null });
    });

    it('caps the page size between 1 and 100', async () => {
      page.mockResolvedValue({ records: [], last: null, hasMore: false });

      await service.list(ORG, { limit: 10_000 });
      await service.list(ORG, { limit: 0 });

      expect(page.mock.calls[0]?.[0].limit).toBe(100);
      expect(page.mock.calls[1]?.[0].limit).toBe(1);
    });

    it('hands back a cursor when there is more, and that cursor brings the next page', async () => {
      page.mockResolvedValue({ records: [record()], last: { createdAt: EXACT, id: ROW_ID }, hasMore: true });

      const first = await service.list(ORG, { limit: 1 });
      expect(first.nextCursor).not.toBeNull();

      await service.list(ORG, { limit: 1, cursor: first.nextCursor ?? '' });
      expect(page.mock.calls[1]?.[0].after).toEqual({ createdAt: EXACT, id: ROW_ID });
    });

    it('passes a member filter on, and keeps the organization filter beside it', async () => {
      page.mockResolvedValue({ records: [], last: null, hasMore: false });

      await service.list(ORG, { staffUserId: ROW_ID });

      expect(page.mock.calls[0]?.[0]).toMatchObject({ organizationId: ORG, staffUserId: ROW_ID });
    });

    it('passes the filters on: an action prefix and a date range', async () => {
      page.mockResolvedValue({ records: [], last: null, hasMore: false });

      await service.list(ORG, { actionPrefix: 'team.', from: '2026-11-01', to: '2026-12-01' });

      expect(page.mock.calls[0]?.[0]).toMatchObject({ actionPrefix: 'team.', from: '2026-11-01', to: '2026-12-01' });
    });

    it.each(['team%', "x' OR 1=1 --", 'TEAM.', '', 'a'.repeat(41), 'team.invite created'])('refuses the action filter %j with 400', async (bad) => {
      await expect(service.list(ORG, { actionPrefix: bad })).rejects.toMatchObject({ status: 400, response: { code: 'AUDIT_FILTER_INVALID' } });
      expect(page).not.toHaveBeenCalled();
    });

    it.each([
      'not-base64-at-all!!',
      Buffer.from('nonsense', 'utf8').toString('base64url'),
      Buffer.from(`2026-11-26|${ROW_ID}`, 'utf8').toString('base64url'),
      Buffer.from(`${EXACT}|not-a-uuid`, 'utf8').toString('base64url'),
      Buffer.from(`${EXACT}|${ROW_ID}|extra`, 'utf8').toString('base64url'),
      Buffer.from(`${EXACT}'; DROP TABLE audit_log;--|${ROW_ID}`, 'utf8').toString('base64url'),
    ])('refuses the malformed cursor %# with 400, never reaching the query', async (cursor) => {
      await expect(service.list(ORG, { cursor })).rejects.toMatchObject({ status: 400, response: { code: 'AUDIT_CURSOR_INVALID' } });
      expect(page).not.toHaveBeenCalled();
    });
  });
});
