/**
 * @file apps/api/src/modules/payments/payment-webhook.repository.spec.ts
 * @feature payments
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { PaymentWebhookRepository } from './payment-webhook.repository';

const INPUT = { provider: 'mock', eventId: 'evt_1', type: 'payment_intent.succeeded', payloadSha256: 'a'.repeat(64) };

describe('PaymentWebhookRepository', () => {
  const query = jest.fn();
  const clientQuery = jest.fn();
  let repository: PaymentWebhookRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    const moduleRef = await Test.createTestingModule({
      providers: [PaymentWebhookRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(PaymentWebhookRepository);
  });

  it('writes the event first, once per provider event id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });

    expect(await repository.register(INPUT)).toEqual({ outcome: 'new', id: 'row-1' });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (provider, provider_event_id) DO NOTHING');
    expect(params).toEqual(['mock', 'evt_1', 'payment_intent.succeeded', 'a'.repeat(64)]);
  });

  it('stores a hash of the body, never the body', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });

    await repository.register(INPUT);

    expect(String((query.mock.calls[0] as [string])[0])).not.toMatch(/payload\b[^_]|body/);
  });

  it('takes an event again when the earlier attempt failed or its process died, and counts the attempt', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });

    expect(await repository.register(INPUT)).toEqual({ outcome: 'retry', id: 'row-1' });

    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("status = 'failed' OR (status = 'received' AND updated_at < now()");
    expect(sql).toContain('attempts = attempts + 1');
    expect(params).toEqual(['mock', 'evt_1', 120]);
  });

  it.each(['processed', 'ignored', 'received'] as const)('acknowledges a duplicate that is %s without taking it', async (status) => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'row-1', status, payload_sha256: 'a'.repeat(64) }] });

    expect(await repository.register(INPUT)).toEqual({ outcome: 'duplicate', id: 'row-1', status, sameBody: true });
  });

  it('notices a duplicate id that arrives with a different body', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'row-1', status: 'processed', payload_sha256: 'b'.repeat(64) }] });

    expect(await repository.register(INPUT)).toMatchObject({ outcome: 'duplicate', sameBody: false });
  });

  it('finishes the event inside the caller\'s transaction with a short note', async () => {
    await repository.finish({ query: clientQuery } as never, 'row-1', 'ignored', 'x'.repeat(300));

    const [sql, params] = clientQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('processed_at = now()');
    expect(params[0]).toBe('row-1');
    expect(params[1]).toBe('ignored');
    expect(String(params[2])).toHaveLength(200);
  });

  it('marks a failed event so the next delivery takes it again, only while it is still being processed', async () => {
    await repository.markFailed('row-1', 'processing_error');

    expect(String((query.mock.calls[0] as [string])[0])).toContain("status = 'received'");
    expect(query.mock.calls[0]?.[1]).toEqual(['row-1', 'processing_error']);
  });
});
