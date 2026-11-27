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
import { AUDITED } from '../../shared/audit/audited.decorator';
import { StaffBookingsController } from './staff-bookings.controller';
import { cancelAuditMetadata, changeDatesAuditMetadata, createBookingAuditMetadata, markPaidAuditMetadata, refundMarkedPaidAuditMetadata } from './staff-audit-details';

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

  it('cancel: who (name, role), booking reference, reason, refund amount/percent/status (written by the service, in the cancel\'s transaction)', () => {
    const metadata = cancelAuditMetadata(EMPLOYEE_WITH_ACCESS, BOOKING_ID, 'goodwill', { amountCents: 25000, percent: 25, reason: 'goodwill', status: 'pending', currencyCode: 'EUR' });

    expect(metadata).toEqual({
      actorName: 'Pat Permitted',
      actorRole: 'employee',
      viaRefundAccess: true,
      bookingReference: 'BK-1A2B3C4D5E',
      reason: 'goodwill',
      refundIssued: true,
      refundCents: 25000,
      refundPercent: 25,
      refundReason: 'goodwill',
      refundStatus: 'pending',
      refundCurrency: 'EUR',
    });
    expect(JSON.stringify(metadata)).not.toMatch(/@|private words|FR76/);
  });

  it('cancel without a refund records refundCents 0 and that nothing was issued; an admin is not "via refund access"', () => {
    expect(cancelAuditMetadata(ADMIN, BOOKING_ID, 'guest_request', null)).toMatchObject({
      actorRole: 'admin',
      actorName: 'Ada Admin',
      viaRefundAccess: false,
      refundIssued: false,
      refundCents: 0,
      reason: 'guest_request',
    });
  });

  it('cancel is no longer written by the interceptor (the service does it inside the transaction): no double row', () => {
    expect(Reflect.getMetadata(AUDITED, StaffBookingsController.prototype.cancel) ?? null).toBeNull();
  });

  it('change dates: old and new reference, fee waiver, outside settlement and the difference refund (written by the service, in the swap\'s transaction)', () => {
    const metadata = changeDatesAuditMetadata(
      EMPLOYEE_WITH_ACCESS,
      BOOKING_ID,
      '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
      { waiveFee: true, balanceSettledOutside: true },
      { amountCents: 4000, percent: 0, reason: 'dates_changed', status: 'pending', currencyCode: 'EUR' },
    );

    expect(metadata).toMatchObject({
      actorRole: 'employee',
      bookingReference: 'BK-1A2B3C4D5E',
      newBookingReference: 'BK-2A3B4C5D6E',
      waiveFee: true,
      balanceSettledOutside: true,
      refundIssued: true,
      refundCents: 4000,
      refundReason: 'dates_changed',
    });
    expect(JSON.stringify(metadata)).not.toMatch(/private words|@/);
  });

  it('change dates is no longer written by the interceptor (the service does it inside the transaction): no double row', () => {
    expect(Reflect.getMetadata(AUDITED, StaffBookingsController.prototype.changeDates) ?? null).toBeNull();
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

  it('refund mark paid: who, the refund and its amount, but not the note the person wrote (written by the service, in its transaction)', () => {
    const metadata = refundMarkedPaidAuditMetadata(ADMIN, { inventory_block_id: BOOKING_ID, amount_cents: 25000, reason: 'goodwill', currency_code: 'EUR' });

    expect(metadata).toMatchObject({ actorRole: 'admin', refundCents: 25000, refundReason: 'goodwill', refundStatus: 'succeeded', refundCurrency: 'EUR', bookingReference: 'BK-1A2B3C4D5E' });
    expect(JSON.stringify(metadata)).not.toContain('FR76');
  });

  it('refund mark paid is no longer written by the interceptor (the service does it inside the transaction): no double row', () => {
    expect(Reflect.getMetadata(AUDITED, StaffBookingsController.prototype.markPaid) ?? null).toBeNull();
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
  it('create booking: who, reference, stay, dates, price and method; never the guest\'s name, email, phone or note (written by the creator, in its transaction)', () => {
    const metadata = createBookingAuditMetadata(ADMIN, {
      id: BOOKING_ID,
      houseId: 'house-1',
      checkIn: '2027-08-01',
      checkOut: '2027-08-04',
      guestCount: 2,
      totalCents: 96000,
      currencyCode: 'EUR',
      extras: [
        { name: 'Breakfast basket', lineCents: 3600 },
        { name: 'Extra pillows', lineCents: 0 },
      ],
      bookingSource: 'phone_email',
      paymentMethod: 'pay_at_hotel',
      paymentStatus: 'pending',
    });

    expect(metadata).toEqual({
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
      bookingSource: 'phone_email',
      extrasCount: 2,
      extrasCents: 3600,
      extraNames: ['Breakfast basket', 'Extra pillows'],
    });
  });

  it('create booking is no longer written by the interceptor (the creator does it inside the transaction): no double row', () => {
    expect(Reflect.getMetadata(AUDITED, StaffBookingsController.prototype.create) ?? null).toBeNull();
  });

  it('mark paid: who ticked it, the booking and the amount recorded as received (written by the service, in its transaction)', () => {
    const metadata = markPaidAuditMetadata(EMPLOYEE_WITH_ACCESS, { id: BOOKING_ID, total_cents: 96000, currency_code: 'EUR' });

    expect(metadata).toEqual({
      actorName: 'Pat Permitted',
      actorRole: 'employee',
      viaRefundAccess: true,
      bookingReference: 'BK-1A2B3C4D5E',
      paidCents: 96000,
      currency: 'EUR',
      paymentMethod: 'pay_at_hotel',
    });
    expect(JSON.stringify(metadata)).not.toMatch(/@|phone|note/i);
  });

  it('mark paid is no longer written by the interceptor (the service does it inside the transaction): no double row', () => {
    expect(Reflect.getMetadata(AUDITED, StaffBookingsController.prototype.markBookingPaid) ?? null).toBeNull();
  });
});
