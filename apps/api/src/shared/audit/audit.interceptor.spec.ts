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

  public plain(): void {
    return;
  }
}

const STAFF = { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys' };

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
