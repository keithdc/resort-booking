/**
 * @file apps/api/src/modules/property/property.controller.geocode.spec.ts
 * @feature property
 * @dependencies PropertyController, GeocodeLimiter
 *
 * The staff geocode routes are limited per person BEFORE anything is forwarded to Photon or Nominatim (docs/13 R2-20).
 */

import { Test } from '@nestjs/testing';
import type { GeocodeHit, StaffProfile } from '@resort-booking/shared-types';
import { RoleGuard } from '../../shared/roles/role.guard';
import { RateLimitedException } from '../../shared/http/rate-limited.exception';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { PublicRateLimitGuard } from '../../shared/http/public-rate-limit';
import { StaffGuard } from '../identity/staff.guard';
import { GeocodeLimiter } from './geocode-limiter';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';

const STAFF: StaffProfile = { id: 'staff-1', organizationId: 'org-1', fullName: 'Ada', email: 'ada@example.com' };
const HIT: GeocodeHit = { label: 'Paris', addressLine: 'Rue 1', city: 'Paris', postalCode: '75001', countryCode: 'FR', latitude: 48.8, longitude: 2.3 };

describe('PropertyController geocode routes', () => {
  const check = jest.fn<Promise<void>, [string]>();
  const searchAddress = jest.fn<Promise<GeocodeHit[]>, [string]>();
  const reverseAddress = jest.fn<Promise<GeocodeHit | null>, [number, number]>();
  let controller: PropertyController;

  beforeEach(async () => {
    jest.resetAllMocks();
    check.mockResolvedValue(undefined);
    searchAddress.mockResolvedValue([HIT]);
    reverseAddress.mockResolvedValue(HIT);
    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyController],
      providers: [
        { provide: PropertyService, useValue: { searchAddress, reverseAddress } },
        { provide: GeocodeLimiter, useValue: { check } },
      ],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(PublicRateLimitGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(PropertyController);
  });

  it('counts the search against the signed-in person, then forwards it', async () => {
    await expect(controller.geocode(STAFF, { q: 'rue de rivoli' })).resolves.toEqual({ status: 'ok', data: [HIT] });

    expect(check).toHaveBeenCalledWith('staff-1');
    expect(searchAddress).toHaveBeenCalledWith('rue de rivoli');
  });

  it('counts the pin drop against the signed-in person, then forwards it', async () => {
    await expect(controller.reverseGeocode(STAFF, { lat: 48.8, lon: 2.3 })).resolves.toEqual({ status: 'ok', data: HIT });

    expect(check).toHaveBeenCalledWith('staff-1');
    expect(reverseAddress).toHaveBeenCalledWith(48.8, 2.3);
  });

  it('forwards nothing when the person is over the limit', async () => {
    check.mockRejectedValue(new RateLimitedException('GEOCODE_RATE_LIMITED', 'slow down', 12));

    await expect(controller.geocode(STAFF, { q: 'rue de rivoli' })).rejects.toMatchObject({ status: 429 });
    await expect(controller.reverseGeocode(STAFF, { lat: 1, lon: 1 })).rejects.toMatchObject({ status: 429 });

    expect(searchAddress).not.toHaveBeenCalled();
    expect(reverseAddress).not.toHaveBeenCalled();
  });
});
