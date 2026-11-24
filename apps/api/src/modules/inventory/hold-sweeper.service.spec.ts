/**
 * @file apps/api/src/modules/inventory/hold-sweeper.service.spec.ts
 * @feature inventory
 * @dependencies HoldSweeperService, @nestjs/testing
 */

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HoldSweeperService } from './hold-sweeper.service';
import { InventoryRepository } from './inventory.repository';

describe('HoldSweeperService', () => {
  const expireAllOverdueHolds = jest.fn<Promise<number>, []>();
  let service: HoldSweeperService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation((): void => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [HoldSweeperService, { provide: InventoryRepository, useValue: { expireAllOverdueHolds } }],
    }).compile();
    service = moduleRef.get(HoldSweeperService);
    // Drop Nest's own startup log lines so assertions only see the sweeper's.
    jest.mocked(Logger.prototype.log).mockClear();
  });

  afterEach((): void => {
    jest.restoreAllMocks();
  });

  it('expires overdue holds with one repository call and reports the count', async (): Promise<void> => {
    expireAllOverdueHolds.mockResolvedValue(3);

    await expect(service.sweep()).resolves.toBe(3);

    expect(expireAllOverdueHolds).toHaveBeenCalledTimes(1);
  });

  it('does nothing and stays quiet when no hold is overdue', async (): Promise<void> => {
    expireAllOverdueHolds.mockResolvedValue(0);

    await expect(service.sweep()).resolves.toBe(0);

    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('logs how many holds it expired', async (): Promise<void> => {
    expireAllOverdueHolds.mockResolvedValue(2);

    await service.sweep();

    expect(Logger.prototype.log).toHaveBeenCalledWith('Expired 2 overdue hold(s)');
  });

  it('never throws when the database fails, and logs the failure', async (): Promise<void> => {
    expireAllOverdueHolds.mockRejectedValue(new Error('connection lost'));

    await expect(service.sweep()).resolves.toBe(0);

    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });

  it('recovers on the next run after a failure', async (): Promise<void> => {
    expireAllOverdueHolds.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce(1);

    await service.sweep();

    await expect(service.sweep()).resolves.toBe(1);
  });

  it('skips a run that starts while the previous sweep is still in flight', async (): Promise<void> => {
    let finish: (count: number) => void = (): void => undefined;
    expireAllOverdueHolds.mockImplementationOnce(
      () =>
        new Promise<number>((resolve): void => {
          finish = resolve;
        }),
    );

    const first = service.sweep();
    const overlapping = await service.sweep();
    finish(4);

    expect(overlapping).toBe(0);
    await expect(first).resolves.toBe(4);
    expect(expireAllOverdueHolds).toHaveBeenCalledTimes(1);
  });
});
