/**
 * @file apps/api/src/modules/team/registration.controller.spec.ts
 * @feature team
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { RequestWithId } from '../../shared/http/request-id';
import type { StaffSessionResult } from '../../shared/roles/staff-role';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { RegisterDto } from './dto/register.dto';
import { RegistrationController } from './registration.controller';
import { TeamService, type PublicContext } from './team.service';
import type { InvitePreview, RegistrationStatus } from './team.types';

const SESSION: StaffSessionResult = {
  token: 't'.repeat(64),
  expiresAt: '2027-01-01T00:00:00.000Z',
  staff: { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true },
};
const TOKEN = 'b'.repeat(64);

function request(): RequestWithId {
  return Object.assign(Object.create(null) as RequestWithId, { ip: '203.0.113.7', requestId: 'req-1' });
}

describe('RegistrationController', () => {
  const status = jest.fn<RegistrationStatus, []>();
  const register = jest.fn<Promise<StaffSessionResult>, [RegisterDto, PublicContext]>();
  const preview = jest.fn<Promise<InvitePreview>, [string, PublicContext]>();
  const accept = jest.fn<Promise<StaffSessionResult>, [AcceptInviteDto, PublicContext]>();
  let controller: RegistrationController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [RegistrationController],
      providers: [{ provide: TeamService, useValue: { status, register, preview, accept } }],
    }).compile();
    controller = moduleRef.get(RegistrationController);
  });

  it('says whether registration is open', () => {
    status.mockReturnValue({ open: false });

    expect(controller.status()).toEqual({ status: 'ok', data: { open: false } });
  });

  it('registers with the caller IP and request id (for the limiter and the audit log)', async () => {
    register.mockResolvedValue(SESSION);
    const body: RegisterDto = { organizationName: 'Humphreys', fullName: 'Ada', email: 'ada@example.com', password: 'Correct-Horse-9' };

    await expect(controller.register(body, request())).resolves.toEqual({ status: 'ok', data: SESSION });

    expect(register).toHaveBeenCalledWith(body, { ip: '203.0.113.7', requestId: 'req-1' });
  });

  it('previews an invitation from a token in the BODY, with the caller IP (new links keep the token out of the address)', async () => {
    preview.mockResolvedValue({ organizationName: 'Humphreys', email: 'new@example.com', role: 'employee', isReset: false });

    await expect(controller.previewByBody({ token: TOKEN }, request())).resolves.toEqual({
      status: 'ok',
      data: { organizationName: 'Humphreys', email: 'new@example.com', role: 'employee', isReset: false },
    });

    expect(preview).toHaveBeenCalledWith(TOKEN, { ip: '203.0.113.7', requestId: 'req-1' });
  });

  it('previews an invitation with the caller IP', async () => {
    preview.mockResolvedValue({ organizationName: 'Humphreys', email: 'new@example.com', role: 'employee', isReset: false });

    await expect(controller.preview(TOKEN, request())).resolves.toEqual({
      status: 'ok',
      data: { organizationName: 'Humphreys', email: 'new@example.com', role: 'employee', isReset: false },
    });

    expect(preview).toHaveBeenCalledWith(TOKEN, { ip: '203.0.113.7', requestId: 'req-1' });
  });

  it.each(['abc', 'g'.repeat(64), 'B'.repeat(64), `${TOKEN}0`, '../../etc/passwd'])(
    'answers the usual 404 INVITE_INVALID for the impossible token %j without touching the service',
    async (token) => {
      await expect(controller.preview(token, request())).rejects.toMatchObject({ status: 404, response: { code: 'INVITE_INVALID' } });

      expect(preview).not.toHaveBeenCalled();
    },
  );

  it('accepts an invitation with the caller IP', async () => {
    accept.mockResolvedValue(SESSION);
    const body: AcceptInviteDto = { token: TOKEN, password: 'Correct-Horse-9' };

    await expect(controller.accept(body, request())).resolves.toEqual({ status: 'ok', data: SESSION });

    expect(accept).toHaveBeenCalledWith(body, { ip: '203.0.113.7', requestId: 'req-1' });
  });

  it('has no staff guard: these routes are public on purpose', () => {
    for (const handler of [controller.status, controller.register, controller.preview, controller.previewByBody, controller.accept]) {
      expect(Reflect.getMetadata('__guards__', handler)).toBeUndefined();
    }
    expect(Reflect.getMetadata('__guards__', RegistrationController)).toBeUndefined();
  });
});
