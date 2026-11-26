/**
 * @file apps/api/src/modules/payments/payments.repository.spec.ts
 * @feature payments
 */

import { Test } from '@nestjs/testing';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { PaymentsRepository } from './payments.repository';

const ROW = {
  id: 'p1', organization_id: 'o', property_id: 'pr', inventory_block_id: 'b', provider: 'mock', provider_ref: 'x',
  amount_cents: 100, currency_code: 'EUR', status: 'requires_payment', failure_reason: null, purpose: 'booking', payload: null,
};

describe('PaymentsRepository', () => {
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, ...unknown[]]>();
  const clientQuery = jest.fn<Promise<{ rowCount: number }>, [string, ...unknown[]]>();
  let repository: PaymentsRepository;
  let client: PoolClient;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [ROW] });
    clientQuery.mockResolvedValue({ rowCount: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [PaymentsRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(PaymentsRepository);
    client = Object.assign(new Client(), { release: (): void => undefined, query: clientQuery });
  });

  it('reads the purpose and the agreed change with every payment', async () => {
    await repository.getById('p1');

    expect(query.mock.calls[0]?.[0]).toContain('purpose, payload');
  });

  it('opens an ordinary booking payment by default, with no stored change', async () => {
    await repository.insert({ organizationId: 'o', propertyId: 'pr', holdId: 'b', provider: 'mock', providerRef: 'x', amountCents: 100, currencyCode: 'EUR' });

    expect(query.mock.calls[0]?.[1]).toEqual(['o', 'pr', 'b', 'mock', 'x', 100, 'EUR', 'booking', null]);
  });

  it('stores the agreed change as JSON with a date-change payment', async () => {
    await repository.insert({
      organizationId: 'o', propertyId: 'pr', holdId: 'b', provider: 'mock', providerRef: 'x', amountCents: 24000, currencyCode: 'EUR',
      purpose: 'rebook', payload: { newCheckIn: '2027-08-01' },
    });

    expect(query.mock.calls[0]?.[1]).toEqual(['o', 'pr', 'b', 'mock', 'x', 24000, 'EUR', 'rebook', '{"newCheckIn":"2027-08-01"}']);
    expect(query.mock.calls[0]?.[0]).toContain('$9::jsonb');
  });

  it('adds a payment\'s amount to what the booking has paid, in the caller\'s transaction', async () => {
    await repository.creditBooking(client, 'p1');

    const sql = clientQuery.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('paid_cents = COALESCE(ib.paid_cents, 0) + p.amount_cents');
    expect(clientQuery.mock.calls[0]?.[1]).toEqual(['p1']);
  });

  it('only marks an OPEN payment succeeded', async () => {
    await repository.markSucceeded(client, 'p1');

    expect(clientQuery.mock.calls[0]?.[0]).toContain("status = 'requires_payment'");
  });

  it('reports whether it actually settled something', async () => {
    clientQuery.mockResolvedValueOnce({ rowCount: 0 });

    await expect(repository.markSucceeded(client, 'p1')).resolves.toBe(false);
  });

  describe('insertSucceededManual', () => {
    const INPUT = { bookingId: 'b', organizationId: 'o', propertyId: 'pr', amountCents: 26000, currencyCode: 'EUR' };

    it('records an already-succeeded rebook payment with provider "manual" and a unique reference', async () => {
      clientQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: 'pay-m' }] } as never);

      const id = await repository.insertSucceededManual(client, INPUT);

      const [sql, params] = clientQuery.mock.calls[0] as [string, unknown[]];
      expect(id).toBe('pay-m');
      expect(sql).toContain("'manual'");
      expect(sql).toContain("'succeeded', 'rebook'");
      expect(params.slice(0, 3)).toEqual(['o', 'pr', 'b']);
      expect(String(params[3])).toMatch(/^manual_[0-9a-f-]{36}$/);
      expect(params.slice(4)).toEqual([26000, 'EUR']);
    });

    it('gives each manual payment its own reference', async () => {
      clientQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: 'x' }] } as never);

      await repository.insertSucceededManual(client, INPUT);
      await repository.insertSucceededManual(client, INPUT);

      const refs = clientQuery.mock.calls.map((call) => {
        const params: unknown = call[1];
        return Array.isArray(params) ? (params as unknown[])[3] : undefined;
      });
      expect(refs[0]).not.toEqual(refs[1]);
    });

    it('throws when the insert returns no row', async () => {
      clientQuery.mockResolvedValue({ rowCount: 0, rows: [] } as never);

      await expect(repository.insertSucceededManual(client, INPUT)).rejects.toThrow('no row');
    });
  });

  describe('what the webhook handler needs', () => {
    it('finds a payment by the provider\'s own reference, per provider', async () => {
      expect(await repository.findByProviderRef('mock', 'pi_1')).toEqual(ROW);

      expect(query.mock.calls[0]?.[0]).toContain('provider = $1 AND provider_ref = $2');
      expect(query.mock.calls[0]?.[1]).toEqual(['mock', 'pi_1']);
    });

    it('returns null for a reference we never created', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      expect(await repository.findByProviderRef('mock', 'pi_x')).toBeNull();
    });

    it('re-reads and locks a payment inside the caller\'s transaction', async () => {
      clientQuery.mockResolvedValueOnce({ rowCount: 1, rows: [ROW] } as never);

      expect(await repository.lockById(client, 'p1')).toEqual(ROW);

      expect(clientQuery.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    });

    it('records a late success only from open, failed or cancelled, never from succeeded', async () => {
      expect(await repository.markLateSucceeded(client, 'p1')).toBe(true);

      const sql = clientQuery.mock.calls[0]?.[0] ?? '';
      expect(sql).toContain("status IN ('requires_payment', 'failed', 'cancelled')");
      expect(sql).toContain("failure_reason = 'late_success'");
      clientQuery.mockResolvedValueOnce({ rowCount: 0 });
      expect(await repository.markLateSucceeded(client, 'p1')).toBe(false);
    });

    it('ends an open attempt in the caller\'s transaction, only while it is open', async () => {
      expect(await repository.markEndedIn(client, 'p1', 'failed', 'card_declined')).toBe(true);

      expect(clientQuery.mock.calls[0]?.[0]).toContain("status = 'requires_payment'");
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['p1', 'failed', 'card_declined']);
    });
  });
});
