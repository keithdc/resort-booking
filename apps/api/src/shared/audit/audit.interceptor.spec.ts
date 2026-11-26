/**
 * @file apps/api/src/shared/audit/audit.interceptor.spec.ts
 * @shared @Audited routes write an audit row after success: ids and field NAMES only
 */

import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { Audited } from './audited.decorator';
import type { AuditActor } from './audit.types';

class Routes {
  @Audited({ action: 'discount.deleted', targetType: 'discount', targetParam: 'discountId' })
  public remove(): void {
    return;
  }

  @Audited({ action: 'discount.created', targetType: 'discount', targetFromResult: 'id' })
  public create(): void {
    return;
  }

  @Audited({ action: 'org.settings_changed', targetType: 'organization', fieldNames: true })
  public settings(): void {
    return;
  }

  @Audited({ action: 'org.settings_changed', targetType: 'organization', changeSet: true })
  public changeSet(): void {
    return;
  }

  @Audited({
    action: 'refund.retried',
    targetType: 'refund',
    targetParam: 'id',
    details: ({ staff, result }): Record<string, string | boolean> => ({ actorRole: staff.role, ok: typeof result === 'object' }),
  })
  public withDetails(): void {
    return;
  }

  @Audited({
    action: 'refund.retried',
    targetType: 'refund',
    targetParam: 'id',
    fieldNames: true,
    details: (): Record<string, string> => {
      throw new Error('bad builder');
    },
  })
  public brokenDetails(): void {
    return;
  }

  public plain(): void {
    return;
  }
}

const STAFF = { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true };

function context(handler: () => void, request: Record<string, unknown>): ExecutionContextHost {
  return new ExecutionContextHost([{ staff: STAFF, ip: '203.0.113.7', requestId: 'req-1', params: {}, body: {}, ...request }], Routes, handler);
}

describe('AuditInterceptor', () => {
  const recordBy = jest.fn<Promise<boolean>, [AuditActor, string, Record<string, unknown>]>();
  let interceptor: AuditInterceptor;

  beforeEach(async () => {
    jest.resetAllMocks();
    recordBy.mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [AuditInterceptor, Reflector, { provide: AuditService, useValue: { recordBy } }],
    }).compile();
    interceptor = moduleRef.get(AuditInterceptor);
  });

  it('writes the row after the handler succeeds, naming the target from the route parameter', async () => {
    const next = { handle: () => of({ status: 'ok', data: null }) };

    await firstValueFrom(interceptor.intercept(context(Routes.prototype.remove, { params: { discountId: 'd1' } }), next));

    expect(recordBy).toHaveBeenCalledWith(
      { organizationId: 'o1', staffUserId: 's1', ip: '203.0.113.7', requestId: 'req-1' },
      'discount.deleted',
      { targetType: 'discount', targetId: 'd1' },
    );
  });

  it('takes the id of a created row from the response data', async () => {
    const next = { handle: () => of({ status: 'ok', data: { id: 'new-discount', label: 'secret label' } }) };

    await firstValueFrom(interceptor.intercept(context(Routes.prototype.create, {}), next));

    expect(recordBy.mock.calls[0]?.[2]).toEqual({ targetType: 'discount', targetId: 'new-discount' });
  });

  it('records only the NAMES of the body fields, sorted, never their values', async () => {
    const next = { handle: () => of({ status: 'ok', data: {} }) };

    await firstValueFrom(
      interceptor.intercept(context(Routes.prototype.settings, { body: { iban: 'FR76-SECRET', bic: 'AGRIFRPP', name: 'Humphreys' } }), next),
    );

    expect(recordBy.mock.calls[0]?.[2]).toEqual({ targetType: 'organization', metadata: { fields: ['bic', 'iban', 'name'] } });
    expect(JSON.stringify(recordBy.mock.calls)).not.toContain('FR76-SECRET');
  });

  it('takes the metadata of a changeSet route from what the handler found, not from the body\'s field names', async () => {
    const next = { handle: () => of({ status: 'ok', data: null }) };
    const auditChanges = { fields: ['iban'], bankDetailsChanged: true, notice: 'bank_details_changed' };
    // The body carries every field on every save; none of its names may reach the row.
    const body = { name: 'x', iban: 'FR76 SECRET', bic: 'y' };

    await firstValueFrom(interceptor.intercept(context(Routes.prototype.changeSet, { auditChanges, body }), next));

    expect(recordBy.mock.calls[0]?.[2].metadata).toEqual(auditChanges);
    expect(JSON.stringify(recordBy.mock.calls)).not.toContain('SECRET');
  });

  it('records an empty field list for a changeSet route whose handler named nothing', async () => {
    const next = { handle: () => of({ status: 'ok', data: null }) };

    await firstValueFrom(interceptor.intercept(context(Routes.prototype.changeSet, { body: { name: 'x' } }), next));

    expect(recordBy.mock.calls[0]?.[2].metadata).toEqual({ fields: [] });
  });

  it('adds the metadata a route\'s details function builds from who acted and the answer', async () => {
    const next = { handle: () => of({ status: 'ok', data: {} }) };

    await firstValueFrom(interceptor.intercept(context(Routes.prototype.withDetails, { params: { id: 'r1' } }), next));

    expect(recordBy.mock.calls[0]?.[2]).toEqual({ targetType: 'refund', targetId: 'r1', metadata: { actorRole: 'admin', ok: true } });
  });

  it('still writes the row (with the field names) when a details function throws', async () => {
    const next = { handle: () => of({ status: 'ok', data: {} }) };

    await firstValueFrom(interceptor.intercept(context(Routes.prototype.brokenDetails, { params: { id: 'r1' }, body: { b: 1, a: 2 } }), next));

    expect(recordBy.mock.calls[0]?.[2]).toEqual({ targetType: 'refund', targetId: 'r1', metadata: { fields: ['a', 'b'] } });
  });

  it('writes nothing when the handler fails: a refused or failed action is not a change', async () => {
    const next = { handle: () => throwError(() => new Error('boom')) };

    await expect(firstValueFrom(interceptor.intercept(context(Routes.prototype.remove, { params: { discountId: 'd1' } }), next))).rejects.toThrow('boom');

    expect(recordBy).not.toHaveBeenCalled();
  });

  it('leaves routes without @Audited alone', async () => {
    const next = { handle: () => of('x') };

    await expect(firstValueFrom(interceptor.intercept(context(Routes.prototype.plain, {}), next))).resolves.toBe('x');

    expect(recordBy).not.toHaveBeenCalled();
  });

  it('does not block the response when the audit write is slow or fails', async () => {
    recordBy.mockRejectedValue(new Error('db down'));
    const next = { handle: () => of({ status: 'ok', data: { id: 'x' } }) };

    await expect(firstValueFrom(interceptor.intercept(context(Routes.prototype.create, {}), next))).resolves.toEqual({
      status: 'ok',
      data: { id: 'x' },
    });
  });

  it('writes nothing without a signed-in person', async () => {
    const next = { handle: () => of('x') };

    await firstValueFrom(interceptor.intercept(context(Routes.prototype.remove, { staff: undefined, params: { discountId: 'd1' } }), next));

    expect(recordBy).not.toHaveBeenCalled();
  });
});
