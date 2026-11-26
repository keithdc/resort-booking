/**
 * @file apps/api/src/modules/bookings/staff-bookings.controller.spec.ts
 * @feature bookings
 * @dependencies StaffBookingsController, StaffGuard
 */

import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { StaffGuard, type StaffRequest } from '../identity/staff.guard';
import { StaffBookingsController } from './staff-bookings.controller';
import { StaffBookingsService } from './staff-bookings.service';
import { StaffRefundsService } from './staff-refunds.service';

const STAFF: StaffAccount = { id: 'staff-1', organizationId: 'org', fullName: 'Sam', email: 's@example.com', role: 'admin', organizationName: 'Org', canManageRefunds: true };
const REQUEST = { staff: STAFF } as StaffRequest;

describe('StaffBookingsController', () => {
  const bookings = {
    cancelPreview: jest.fn(),
    cancel: jest.fn(),
    changeQuote: jest.fn(),
    changeDates: jest.fn(),
  };
  const refunds = { list: jest.fn(), retry: jest.fn(), markPaid: jest.fn() };
  let controller: StaffBookingsController;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [StaffBookingsController],
      providers: [
        { provide: StaffBookingsService, useValue: bookings },
        { provide: StaffRefundsService, useValue: refunds },
      ],
    })
      // Only the wiring is under test here; the real guard is checked through its metadata below.
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(StaffBookingsController);
  });

  it('is protected by StaffGuard as a whole, so every route needs a staff token', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StaffBookingsController) as unknown[];
    expect(guards).toContain(StaffGuard);
    // No route opts out with its own override.
    for (const name of Object.getOwnPropertyNames(StaffBookingsController.prototype).filter((n) => n !== 'constructor' && n !== 'staff')) {
      const handler: unknown = Object.getOwnPropertyDescriptor(StaffBookingsController.prototype, name)?.value;
      expect(typeof handler).toBe('function');
      if (typeof handler === 'function') {
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
      }
    }
  });

  it('wraps results in { status: "ok", data } and passes the signed-in staff member', async () => {
    bookings.cancel.mockResolvedValue({ reservation: {}, refund: null });
    const body = { reason: 'guest_request' as const, refundCents: null, note: 'abc' };

    expect(await controller.cancel('id', body, REQUEST)).toEqual({ status: 'ok', data: { reservation: {}, refund: null } });
    expect(bookings.cancel).toHaveBeenCalledWith(STAFF, 'id', body);
  });

  it('routes preview, quote and change to the staff service', async () => {
    bookings.cancelPreview.mockResolvedValue({ a: 1 });
    bookings.changeQuote.mockResolvedValue({ b: 2 });
    bookings.changeDates.mockResolvedValue({ c: 3 });
    const dates = { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false };

    expect(await controller.cancelPreview('id', REQUEST)).toEqual({ status: 'ok', data: { a: 1 } });
    expect(await controller.changeQuote('id', dates, REQUEST)).toEqual({ status: 'ok', data: { b: 2 } });
    expect(await controller.changeDates('id', { ...dates, note: 'abc', balanceSettledOutside: false }, REQUEST)).toEqual({ status: 'ok', data: { c: 3 } });
  });

  it('lists refunds that need attention by default and passes the property filter', async () => {
    refunds.list.mockResolvedValue([]);

    await controller.listRefunds({}, REQUEST);
    await controller.listRefunds({ status: 'all', propertyId: 'p' }, REQUEST);

    expect(refunds.list).toHaveBeenNthCalledWith(1, STAFF, 'needs_attention', null);
    expect(refunds.list).toHaveBeenNthCalledWith(2, STAFF, 'all', 'p');
  });

  it('retries and marks paid with the note from the body', async () => {
    refunds.retry.mockResolvedValue({ id: 'r' });
    refunds.markPaid.mockResolvedValue({ id: 'r' });

    await controller.retry('r', REQUEST);
    await controller.markPaid('r', { note: 'Bank transfer' }, REQUEST);

    expect(refunds.retry).toHaveBeenCalledWith(STAFF, 'r');
    expect(refunds.markPaid).toHaveBeenCalledWith(STAFF, 'r', 'Bank transfer');
  });

  it('fails loudly if the guard somehow left no staff on the request', async () => {
    await expect(controller.retry('r', {} as StaffRequest)).rejects.toThrow('StaffGuard');
  });
});
