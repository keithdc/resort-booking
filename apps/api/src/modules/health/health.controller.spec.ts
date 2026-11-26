/**
 * @file apps/api/src/modules/health/health.controller.spec.ts
 * @feature health
 */

import { Test } from '@nestjs/testing';
import type { HealthStatus } from '@resort-booking/shared-types';
import { RoleGuard } from '../../shared/roles/role.guard';
import { StaffGuard } from '../identity/staff.guard';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const DOWN: HealthStatus = { ok: false, postgres: true, redis: false, schema: false, schemaAheadOf: ['023_secret_internal_name.sql'] };

describe('HealthController', () => {
  const getStatus = jest.fn<Promise<HealthStatus>, []>();
  let controller: HealthController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { getStatus } }],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(HealthController);
  });

  it('tells the public one thing: up or not', async () => {
    getStatus.mockResolvedValue({ ok: true, postgres: true, redis: true, schema: true, schemaAheadOf: [] });

    await expect(controller.getHealth()).resolves.toEqual({ ok: true });
  });

  it('never leaks which dependency is down or which migrations the build lacks', async () => {
    getStatus.mockResolvedValue(DOWN);

    const body = await controller.getHealth();

    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain('redis');
    expect(JSON.stringify(body)).not.toContain('023_secret');
  });

  it('gives staff the full detail', async () => {
    getStatus.mockResolvedValue(DOWN);

    await expect(controller.getDetailedHealth()).resolves.toEqual(DOWN);
  });

  it('protects the detailed route with the staff guard', () => {
    const guards: unknown = Reflect.getMetadata('__guards__', HealthController.prototype.getDetailedHealth);

    expect(guards).toEqual([StaffGuard, RoleGuard]);
    expect(Reflect.getMetadata('__guards__', HealthController.prototype.getHealth)).toBeUndefined();
  });
});
