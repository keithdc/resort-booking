/**
 * @file apps/api/src/modules/reservations/reservations.controller.spec.ts
 * @feature reservations
 * What each role gets from the report, and which roles may call which route.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { StaffReport } from '@resort-booking/shared-types';
import { RoleGuard } from '../../shared/roles/role.guard';
import { ALLOWED_ROLES } from '../../shared/roles/roles.decorator';
import type { StaffAccount, StaffRole } from '../../shared/roles/staff-role';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { StaffGuard } from '../identity/staff.guard';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

function account(role: StaffRole): StaffAccount {
  return { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role, organizationName: 'Humphreys', canManageRefunds: role === 'admin' };
}

function report(): StaffReport {
  return {
    from: '2026-11-01',
    to: '2026-12-01',
    asOfDate: '2026-11-26',
    propertyId: null,
    currencyCode: 'EUR',
    houseCount: 1,
    availableNights: 30,
    reservationCount: 2,
    occupiedNights: 6,
    revenueCents: 99000,
    averageNightlyCents: 16500,
    occupancyPercent: 20,
    upcomingStayCount: 1,
    inHouseStayCount: 0,
    guestCount: 4,
    propertyBookedCount: 0,
    pendingPaymentCount: 0,
    cancelledCount: 0,
    rebookCount: 0,
    expiredHoldCount: 0,
    pipeline: [],
    properties: [],
    daily: [],
    paymentMethods: [],
    stays: [],
    grossRevenueCents: 99000,
    refundedCents: 0,
    netRevenueCents: 99000,
    cancellationRatePercent: 0,
    cancellationReasons: [],
    refunds: [],
    discountUsage: [],
    attention: { unpaidHoldCount: 0, refundsToPayCount: 0, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0 },
    previous: {
      from: '2026-10-01',
      to: '2026-11-01',
      reservationCount: 1,
      occupiedNights: 3,
      occupancyPercent: 10,
      averageNightlyCents: 15000,
      grossRevenueCents: 45000,
      refundedCents: 0,
      netRevenueCents: 45000,
      cancelledCount: 0,
      cancellationRatePercent: 0,
    },
  };
}

describe('ReservationsController', () => {
  const getReport = jest.fn<Promise<StaffReport>, [unknown, string]>();
  let controller: ReservationsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    getReport.mockResolvedValue(report());
    const moduleRef = await Test.createTestingModule({
      controllers: [ReservationsController],
      providers: [{ provide: ReservationsService, useValue: { getReport } }],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(ReservationsController);
  });

  describe('report', () => {
    it('gives an admin every figure and says the money is not hidden', async () => {
      const result = await controller.getReport({ from: '2026-11-01', to: '2026-12-01' }, account('admin'));

      expect(result.data.moneyHidden).toBe(false);
      expect(result.data.revenueCents).toBe(99000);
      expect(result.data.previous.grossRevenueCents).toBe(45000);
    });

    it('gives an employee the activity but no money, and says so', async () => {
      const result = await controller.getReport({ from: '2026-11-01', to: '2026-12-01' }, account('employee'));

      expect(result.data.moneyHidden).toBe(true);
      expect(result.data.revenueCents).toBe(0);
      expect(result.data.grossRevenueCents).toBe(0);
      expect(result.data.netRevenueCents).toBe(0);
      expect(result.data.previous.grossRevenueCents).toBe(0);
      expect(result.data.occupancyPercent).toBe(20);
      expect(result.data.reservationCount).toBe(2);
    });

    it('asks the service for the caller\'s own organization', async () => {
      await controller.getReport({ from: '2026-11-01', to: '2026-12-01' }, account('employee'));

      expect(getReport).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-12-01' }, 'o1');
    });
  });

  describe('roles', () => {
    const allowed = (handler: object): unknown => Reflect.getMetadata(ALLOWED_ROLES, handler);

    it('lets both roles use the day-to-day routes', () => {
      for (const handler of [
        ReservationsController.prototype.getCalendar,
        ReservationsController.prototype.listDay,
        ReservationsController.prototype.getReport,
        ReservationsController.prototype.setArrival,
        ReservationsController.prototype.getConfig,
      ]) {
        expect(allowed(handler)).toEqual(['admin', 'employee']);
      }
    });

    it('keeps the property configuration editor to admins', () => {
      expect(allowed(ReservationsController.prototype.getPropertyConfig)).toEqual(['admin']);
      expect(allowed(ReservationsController.prototype.savePropertyConfig)).toEqual(['admin']);
    });
  });
});
