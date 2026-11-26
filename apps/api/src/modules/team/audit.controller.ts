/**
 * @file apps/api/src/modules/team/audit.controller.ts
 * @feature team
 * @dependencies AuditService
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { ApiOkBody } from '@resort-booking/shared-types';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditPage } from '../../shared/audit/audit.types';
import { RoleGuard } from '../../shared/roles/role.guard';
import { RequireRole } from '../../shared/roles/roles.decorator';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { CurrentStaff } from '../../shared/tenancy/current-staff.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TenantExempt } from '../../shared/tenancy/tenant-scope.decorator';
import { StaffGuard } from '../identity/staff.guard';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('staff')
@UseGuards(StaffGuard, TenantGuard, RoleGuard)
@RequireRole('admin')
export class AuditController {
  public constructor(private readonly audit: AuditService) {}

  /**
   * The workspace's audit log, newest first, a page at a time (pass `nextCursor` back as `cursor`).
   * Filter with `action` (a prefix such as "team."), `member` (a staff user id), `from` and `to`.
   */
  @Get('audit')
  @TenantExempt('the log is filtered by the caller organization in SQL')
  public async list(@CurrentStaff() staff: StaffAccount, @Query() query: AuditQueryDto): Promise<ApiOkBody<AuditPage>> {
    return {
      status: 'ok',
      data: await this.audit.list(staff.organizationId, {
        ...(query.action === undefined ? {} : { actionPrefix: query.action }),
        ...(query.member === undefined ? {} : { staffUserId: query.member }),
        ...(query.from === undefined ? {} : { from: query.from }),
        ...(query.to === undefined ? {} : { to: query.to }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      }),
    };
  }
}
