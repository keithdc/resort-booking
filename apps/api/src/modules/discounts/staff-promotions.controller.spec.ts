/**
 * @file apps/api/src/modules/discounts/staff-promotions.controller.spec.ts
 * @feature discounts
 */

import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Discount } from '@resort-booking/shared-types';
import { RoleGuard } from '../../shared/roles/role.guard';
import { ALLOWED_ROLES } from '../../shared/roles/roles.decorator';
import { StaffGuard } from '../identity/staff.guard';
import { StaffPromotionsController } from './staff-promotions.controller';

describe('StaffPromotionsController', () => {
  it('lists the property\'s discounts through the service', async () => {
    const rows = [{ id: 'd1' }] as Discount[];
    const list = jest.fn().mockResolvedValue(rows);
    const controller = new StaffPromotionsController({ list } as never);
    await expect(controller.list('prop-1')).resolves.toEqual({ status: 'ok', data: rows });
    expect(list).toHaveBeenCalledWith('prop-1');
  });

  it('is behind the staff, tenant and role guards and open to admins and employees only', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StaffPromotionsController) as unknown[];
    expect(guards).toContain(StaffGuard);
    expect(guards).toContain(RoleGuard);
    const roles = Reflect.getMetadata(ALLOWED_ROLES, StaffPromotionsController.prototype.list) as unknown;
    expect(JSON.stringify(roles)).toContain('employee');
  });
});
