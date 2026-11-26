/**
 * @file apps/api/src/modules/bookings/staff-audit-details.spec.ts
 * @feature bookings
 * @dependencies AuditInterceptor, StaffBookingsController
 * Every staff money action (cancel, change dates, retry, mark paid) writes an audit row that says WHO did it (id, name,
 * role), the booking reference, the refund amount and reason, and never a note, email or secret. The rows are produced
 * by the REAL interceptor reading the REAL route metadata.
 */

import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';
import { AuditInterceptor } from '../../shared/audit/audit.interceptor';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditActor } from '../../shared/audit/audit.types';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { StaffBookingsController } from './staff-bookings.controller';

const BOOKING_ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const EMPLOYEE_WITH_ACCESS: StaffAccount = {
  id: 'staff-9',
  organizationId: 'org-1',
  fullName: 'Pat Permitted',
  email: 'pat@example.com',
  role: 'employee',
  organizationName: 'Org',
  canManageRefunds: true,
};
const ADMIN: StaffAccount = { ...EMPLOYEE_WITH_ACCESS, id: 'staff-1', fullName: 'Ada Admin', role: 'admin' };

const REFUND = {
  id: 'refund-1',
  reference: 'BK-1A2B3C4D5E',
  amountCents: 25000,
  percent: 25,
  reason: 'goodwill',
  status: 'succeeded',
  currencyCode: 'EUR',
  bookerEmail: 'guest@example.com',
  resolutionNote: 'secret bank detail FR76',
};

type Handler = (...args: never[]) => unknown;

describe('audit rows of the staff money actions', () => {
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

  async function run(
    handler: Handler,
    staff: StaffAccount,
    request: { params?: Record<string, string>; body?: unknown },
    answer: unknown,
  ): Promise<void> {
    const context = new ExecutionContextHost(
      [{ staff, ip: '203.0.113.7', requestId: 'req-7', params: request.params ?? {}, body: request.body ?? {} }],
      StaffBookingsController,
      handler,
    );
    await firstValueFrom(interceptor.intercept(context, { handle: () => of(answer) }));
  }

  it('cancel: who (id, name, role), booking reference, reason, refund amount/percent/status', async () => {
    await run(
      StaffBookingsController.prototype.cancel,
      EMPLOYEE_WITH_ACCESS,
      { params: { id: BOOKING_ID }, body: { reason: 'goodwill', refundCents: 25000, note: 'private words' } },
      { status: 'ok', data: { reservation: {}, refund: REFUND } },
    );

    expect(recordBy).toHaveBeenCalledTimes(1);
    const [actor, action, details] = recordBy.mock.calls[0] ?? [];
    expect(actor).toEqual({ organizationId: 'org-1', staffUserId: 'staff-9', ip: '203.0.113.7', requestId: 'req-7' });
    expect(action).toBe('booking.cancelled_by_staff');
    expect(details).toEqual({
      targetType: 'booking',
      targetId: BOOKING_ID,
      metadata: {
        actorName: 'Pat Permitted',
        actorRole: 'employee',
        viaRefundAccess: true,
        bookingReference: 'BK-1A2B3C4D5E',
        reason: 'goodwill',
        refundIssued: true,
        refundCents: 25000,
        refundPercent: 25,
        refundReason: 'goodwill',
        refundStatus: 'succeeded',
        refundCurrency: 'EUR',
      },
    });
    const written = JSON.stringify(recordBy.mock.calls);
    expect(written).not.toContain('private words');
    expect(written).not.toContain('guest@example.com');
    expect(written).not.toContain('FR76');
  });

  it('cancel without a refund records refundCents 0 and that nothing was issued; an admin is not "via refund access"', async () => {
    await run(
      StaffBookingsController.prototype.cancel,
      ADMIN,
      { params: { id: BOOKING_ID }, body: { reason: 'guest_request', refundCents: null, note: 'abc' } },
      { status: 'ok', data: { reservation: {}, refund: null } },
    );

    expect(recordBy.mock.calls[0]?.[2]).toMatchObject({
      metadata: { actorRole: 'admin', actorName: 'Ada Admin', viaRefundAccess: false, refundIssued: false, refundCents: 0, reason: 'guest_request' },
    });
  });

  it('change dates: old and new reference, fee waiver, outside settlement and the difference refund', async () => {
    await run(
      StaffBookingsController.prototype.changeDates,
      EMPLOYEE_WITH_ACCESS,
      { params: { id: BOOKING_ID }, body: { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: true, balanceSettledOutside: true, note: 'private words' } },
      { status: 'ok', data: { reservation: { reference: 'BK-NEW0000001' }, refund: { ...REFUND, reason: 'dates_changed', amountCents: 4000, percent: 0 } } },
    );

    const [actor, action, details] = recordBy.mock.calls[0] ?? [];
    expect(actor).toMatchObject({ staffUserId: 'staff-9' });
    expect(action).toBe('booking.dates_changed_by_staff');
    expect(details).toMatchObject({
      targetType: 'booking',
      targetId: BOOKING_ID,
      metadata: {
        actorRole: 'employee',
        bookingReference: 'BK-1A2B3C4D5E',
        newBookingReference: 'BK-NEW0000001',
        waiveFee: true,
        balanceSettledOutside: true,
        refundCents: 4000,
        refundReason: 'dates_changed',
      },
    });
    expect(JSON.stringify(recordBy.mock.calls)).not.toContain('private words');
  });

  it('refund retry: the refund id as target, its booking reference, amount, reason and the outcome', async () => {
    await run(StaffBookingsController.prototype.retry, EMPLOYEE_WITH_ACCESS, { params: { id: 'refund-1' } }, { status: 'ok', data: REFUND });

    const [actor, action, details] = recordBy.mock.calls[0] ?? [];
    expect(actor).toMatchObject({ staffUserId: 'staff-9', organizationId: 'org-1' });
    expect(action).toBe('refund.retried');
    expect(details).toEqual({
      targetType: 'refund',
      targetId: 'refund-1',
      metadata: {
        actorName: 'Pat Permitted',
        actorRole: 'employee',
        viaRefundAccess: true,
        bookingReference: 'BK-1A2B3C4D5E',
        refundCents: 25000,
        refundReason: 'goodwill',
        refundStatus: 'succeeded',
        refundCurrency: 'EUR',
      },
    });
  });

  it('mark paid: audited with who, the refund and its amount, but not the note the person wrote', async () => {
    await run(
      StaffBookingsController.prototype.markPaid,
      ADMIN,
      { params: { id: 'refund-1' }, body: { note: 'bank transfer FR76 secret' } },
      { status: 'ok', data: { ...REFUND, status: 'succeeded' } },
    );

    expect(recordBy.mock.calls[0]?.[1]).toBe('refund.marked_paid');
    expect(recordBy.mock.calls[0]?.[2]).toMatchObject({ targetId: 'refund-1', metadata: { actorRole: 'admin', refundCents: 25000, bookingReference: 'BK-1A2B3C4D5E' } });
    expect(JSON.stringify(recordBy.mock.calls)).not.toContain('FR76 secret');
  });

  it('writes no row when the action was refused (the interceptor only logs success)', async () => {
    const context = new ExecutionContextHost(
      [{ staff: EMPLOYEE_WITH_ACCESS, params: { id: BOOKING_ID }, body: {} }],
      StaffBookingsController,
      StaffBookingsController.prototype.cancel,
    );
    const failing = { handle: () => { throw new Error('refused'); } };

    expect(() => interceptor.intercept(context, failing)).toThrow('refused');
    expect(recordBy).not.toHaveBeenCalled();
  });
  it('create booking: who, reference, stay, dates, price and method; never the guest\'s name, email, phone or note', async () => {
    await run(
      StaffBookingsController.prototype.create,
      ADMIN,
      { body: { houseId: 'house-1', bookerName: 'Grace Hopper', bookerEmail: 'grace@example.com', bookerPhone: '+33612345678', guestNote: 'allergic to nuts' } },
      {
        status: 'ok',
        data: {
          id: BOOKING_ID,
          reference: 'BK-1A2B3C4D5E',
          houseId: 'house-1',
          checkIn: '2027-08-01',
          checkOut: '2027-08-04',
          guestCount: 2,
          totalCents: 96000,
          currencyCode: 'EUR',
          paymentMethod: 'pay_at_hotel',
          paymentStatus: 'pending',
          bookerName: 'Grace Hopper',
          bookerEmail: 'grace@example.com',
          bookerPhone: '+33612345678',
          guestNote: 'allergic to nuts',
          extras: [
            { name: 'Breakfast basket', kind: 'instant', quantity: 2, unitPriceCents: 1800, lineCents: 3600, status: 'confirmed' },
            { name: 'Extra pillows', kind: 'on_request', quantity: 1, unitPriceCents: 0, lineCents: 0, status: 'pending' },
          ],
        },
      },
    );

    const [, action, details] = recordBy.mock.calls[0] ?? [];
    expect(action).toBe('booking.created_by_staff');
    expect(details).toEqual({
      targetType: 'booking',
      targetId: BOOKING_ID,
      metadata: {
        actorName: 'Ada Admin',
        actorRole: 'admin',
        viaRefundAccess: false,
        bookingReference: 'BK-1A2B3C4D5E',
        houseId: 'house-1',
        checkIn: '2027-08-01',
        checkOut: '2027-08-04',
        guestCount: 2,
        totalCents: 96000,
        currency: 'EUR',
        paymentMethod: 'pay_at_hotel',
        paymentStatus: 'pending',
        extrasCount: 2,
        extrasCents: 3600,
        extraNames: ['Breakfast basket', 'Extra pillows'],
      },
    });
    const written = JSON.stringify(recordBy.mock.calls);
    expect(written).not.toContain('Grace');
    expect(written).not.toContain('grace@example.com');
    expect(written).not.toContain('allergic');
    expect(written).not.toContain('+336');
  });

  it('mark paid: who ticked it, the booking and the amount recorded as received', async () => {
    await run(
      StaffBookingsController.prototype.markBookingPaid,
      EMPLOYEE_WITH_ACCESS,
      { params: { id: BOOKING_ID } },
      { status: 'ok', data: { reference: 'BK-1A2B3C4D5E', paidCents: 96000, currencyCode: 'EUR', paymentMethod: 'pay_at_hotel', bookerEmail: 'guest@example.com' } },
    );

    const [, action, details] = recordBy.mock.calls[0] ?? [];
    expect(action).toBe('booking.marked_paid');
    expect(details).toEqual({
      targetType: 'booking',
      targetId: BOOKING_ID,
      metadata: {
        actorName: 'Pat Permitted',
        actorRole: 'employee',
        viaRefundAccess: true,
        bookingReference: 'BK-1A2B3C4D5E',
        paidCents: 96000,
        currency: 'EUR',
        paymentMethod: 'pay_at_hotel',
      },
    });
    expect(JSON.stringify(recordBy.mock.calls)).not.toContain('guest@example.com');
  });
});
