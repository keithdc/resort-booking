/**
 * @file apps/api/src/modules/identity/session-sweeper.service.spec.ts
 * @feature identity
 */

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IdentityService } from './identity.service';
import { SessionSweeperService } from './session-sweeper.service';

describe('SessionSweeperService', () => {
  const purgeExpiredSessions = jest.fn<Promise<number>, []>();
  let sweeper: SessionSweeperService;

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation((): void => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [SessionSweeperService, { provide: IdentityService, useValue: { purgeExpiredSessions } }],
    }).compile();
    sweeper = moduleRef.get(SessionSweeperService);
    (Logger.prototype.log as jest.Mock).mockClear();
  });

  afterEach(() => jest.restoreAllMocks());

  it('removes expired sessions and says how many', async () => {
    purgeExpiredSessions.mockResolvedValue(4);

    await expect(sweeper.sweep()).resolves.toBe(4);
    expect(Logger.prototype.log).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when there is nothing to remove', async () => {
    purgeExpiredSessions.mockResolvedValue(0);

    await expect(sweeper.sweep()).resolves.toBe(0);
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('never throws: a failed sweep is logged and returns 0', async () => {
    purgeExpiredSessions.mockRejectedValue(new Error('db down'));

    await expect(sweeper.sweep()).resolves.toBe(0);
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });
});
