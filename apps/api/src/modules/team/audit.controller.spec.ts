/**
 * @file apps/api/src/modules/team/audit.controller.spec.ts
 * @feature team
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditFilters, AuditPage } from '../../shared/audit/audit.types';
import { RoleGuard } from '../../shared/roles/role.guard';
import { ALLOWED_ROLES } from '../../shared/roles/roles.decorator';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { StaffGuard } from '../identity/staff.guard';
import { AuditController } from './audit.controller';

const STAFF: StaffAccount = { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys' };
const PAGE: AuditPage = { items: [], nextCursor: null };

describe('AuditController', () => {
  const list = jest.fn<Promise<AuditPage>, [string, AuditFilters]>();
  let controller: AuditController;

  beforeEach(async () => {
    jest.resetAllMocks();
    list.mockResolvedValue(PAGE);
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: { list } }],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(AuditController);
  });

  it('reads only the caller\'s organization, with no filters unless sent', async () => {
    await expect(controller.list(STAFF, {})).resolves.toEqual({ status: 'ok', data: PAGE });

    expect(list).toHaveBeenCalledWith('o1', {});
  });

  it('maps the query to filters: action prefix, dates, cursor and page size', async () => {
    await controller.list(STAFF, { action: 'team.', from: '2026-11-01', to: '2026-12-01', cursor: 'abc', limit: 20 });

    expect(list).toHaveBeenCalledWith('o1', { actionPrefix: 'team.', from: '2026-11-01', to: '2026-12-01', cursor: 'abc', limit: 20 });
  });

  it('is admin only, behind the staff, tenant and role guards', () => {
    expect(Reflect.getMetadata('__guards__', AuditController)).toEqual([StaffGuard, TenantGuard, RoleGuard]);
    expect(Reflect.getMetadata(ALLOWED_ROLES, AuditController)).toEqual(['admin']);
  });
});
