/**
 * @file apps/api/src/modules/identity/two-factor.controller.spec.ts
 * @feature identity
 */

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TwoFactorRecoveryCodes, TwoFactorSetup, TwoFactorStatus } from '@resort-booking/shared-types';
import type { RequestWithId } from '../../shared/http/request-id';
import { RoleGuard } from '../../shared/roles/role.guard';
import { ALLOWED_ROLES } from '../../shared/roles/roles.decorator';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { StaffGuard } from './staff.guard';
import { ConfirmTwoFactorDto, EnableTwoFactorDto, SetupTwoFactorDto, TwoFactorLoginDto } from './dto/two-factor.dto';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService, type TwoFactorContext } from './two-factor.service';

const STAFF: StaffAccount = { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role: 'employee', organizationName: 'Humphreys', canManageRefunds: false };
const CONTEXT: TwoFactorContext = { ip: '203.0.113.7', requestId: 'req-3' };
const CODES: TwoFactorRecoveryCodes = { recoveryCodes: ['AAAAA-BBBBB'] };

function request(): RequestWithId {
  return Object.assign(Object.create(null) as RequestWithId, { ip: '203.0.113.7', requestId: 'req-3' });
}

describe('TwoFactorController', () => {
  const getStatus = jest.fn<Promise<TwoFactorStatus>, [string]>();
  const setup = jest.fn<Promise<TwoFactorSetup>, [StaffAccount, string, TwoFactorContext]>();
  const enable = jest.fn<Promise<TwoFactorRecoveryCodes>, [StaffAccount, string, string, TwoFactorContext, string]>();
  const disable = jest.fn<Promise<void>, [StaffAccount, string, string, TwoFactorContext]>();
  const regenerateRecoveryCodes = jest.fn<Promise<TwoFactorRecoveryCodes>, [StaffAccount, string, string, TwoFactorContext]>();
  let controller: TwoFactorController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TwoFactorController],
      providers: [{ provide: TwoFactorService, useValue: { getStatus, setup, enable, disable, regenerateRecoveryCodes } }],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(TwoFactorController);
  });

  it('reads and starts setup for the signed-in person only (the id comes from the session)', async () => {
    const status: TwoFactorStatus = { enabled: false, enabledAt: null, setupPending: false, recoveryCodesRemaining: 0 };
    const issued: TwoFactorSetup = { secret: 'MZXW6YTB', otpauthUri: 'otpauth://totp/x', issuer: 'Humphreys', accountName: 'ada@example.com' };
    getStatus.mockResolvedValue(status);
    setup.mockResolvedValue(issued);

    await expect(controller.status(STAFF)).resolves.toEqual({ status: 'ok', data: status });
    await expect(controller.setup(STAFF, { currentPassword: 'pw' }, request())).resolves.toEqual({ status: 'ok', data: issued });

    expect(getStatus).toHaveBeenCalledWith('s1');
    expect(setup).toHaveBeenCalledWith(STAFF, 'pw', CONTEXT);
  });

  it('enables with password and code and passes the current session token, the caller IP and request id', async () => {
    enable.mockResolvedValue(CODES);

    await expect(controller.enable(STAFF, { currentPassword: 'pw', code: '123456' }, request(), 'tok')).resolves.toEqual({ status: 'ok', data: CODES });

    expect(enable).toHaveBeenCalledWith(STAFF, 'pw', '123456', CONTEXT, 'tok');
  });

  it('disables with password and code, and regenerates with password and code', async () => {
    disable.mockResolvedValue(undefined);
    regenerateRecoveryCodes.mockResolvedValue(CODES);

    await expect(controller.disable(STAFF, { currentPassword: 'pw', code: '123456' }, request())).resolves.toEqual({ status: 'ok', data: { disabled: true } });
    await expect(controller.regenerate(STAFF, { currentPassword: 'pw', code: 'AAAAA-BBBBB' }, request())).resolves.toEqual({ status: 'ok', data: CODES });

    expect(disable).toHaveBeenCalledWith(STAFF, 'pw', '123456', CONTEXT);
    expect(regenerateRecoveryCodes).toHaveBeenCalledWith(STAFF, 'pw', 'AAAAA-BBBBB', CONTEXT);
  });

  it('is open to both roles, behind the staff and role guards', () => {
    expect(Reflect.getMetadata('__guards__', TwoFactorController)).toEqual([StaffGuard, RoleGuard]);
    expect(Reflect.getMetadata(ALLOWED_ROLES, TwoFactorController)).toEqual(['admin', 'employee']);
    expect(Reflect.getMetadata('path', TwoFactorController)).toBe('staff/me/two-factor');
  });
});

describe('two-factor DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  function check(type: new () => object, value: object): Promise<unknown> {
    return pipe.transform(value, { type: 'body', metatype: type });
  }

  it('accept a code, a password with a code, and the login challenge', async () => {
    await expect(check(EnableTwoFactorDto, { currentPassword: 'pw', code: '123456' })).resolves.toBeDefined();
    await expect(check(SetupTwoFactorDto, { currentPassword: 'pw' })).resolves.toBeDefined();
    await expect(check(ConfirmTwoFactorDto, { currentPassword: 'pw', code: 'ABCDE-FGHJK' })).resolves.toBeDefined();
    await expect(check(TwoFactorLoginDto, { challengeToken: 'a'.repeat(64), code: '123 456' })).resolves.toBeDefined();
  });

  it('reject missing, too short, too long and unknown fields', async () => {
    await expect(check(EnableTwoFactorDto, {})).rejects.toBeDefined();
    await expect(check(EnableTwoFactorDto, { code: '123456' })).rejects.toBeDefined();
    await expect(check(EnableTwoFactorDto, { currentPassword: '', code: '123456' })).rejects.toBeDefined();
    await expect(check(EnableTwoFactorDto, { currentPassword: 'pw', code: '123' })).rejects.toBeDefined();
    await expect(check(EnableTwoFactorDto, { currentPassword: 'pw', code: '1'.repeat(33) })).rejects.toBeDefined();
    await expect(check(EnableTwoFactorDto, { currentPassword: 'pw', code: '123456', extra: true })).rejects.toBeDefined();
    await expect(check(SetupTwoFactorDto, {})).rejects.toBeDefined();
    await expect(check(SetupTwoFactorDto, { currentPassword: '' })).rejects.toBeDefined();
    await expect(check(ConfirmTwoFactorDto, { code: '123456' })).rejects.toBeDefined();
    await expect(check(ConfirmTwoFactorDto, { currentPassword: '', code: '123456' })).rejects.toBeDefined();
  });

  it('only accept a challenge token shaped like the ones we issue', async () => {
    await expect(check(TwoFactorLoginDto, { challengeToken: 'short', code: '123456' })).rejects.toBeDefined();
    await expect(check(TwoFactorLoginDto, { challengeToken: 'Z'.repeat(64), code: '123456' })).rejects.toBeDefined();
    await expect(check(TwoFactorLoginDto, { code: '123456' })).rejects.toBeDefined();
  });
});
