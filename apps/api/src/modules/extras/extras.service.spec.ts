/**
 * @file apps/api/src/modules/extras/extras.service.spec.ts
 * @feature extras
 * What staff may add to a booking: published extras of the property and organization, nothing else.
 */

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ExtraService } from '@resort-booking/shared-types';
import { PropertyService } from '../property/property.service';
import { ExtrasRepository } from './extras.repository';
import { ExtrasService } from './extras.service';

const PUBLISHED: ExtraService = { id: 'x1', organizationId: 'org', propertyId: 'prop', name: 'Breakfast basket', description: '', kind: 'instant', priceCents: 1800, currencyCode: 'EUR', published: true };

describe('ExtrasService.listForBooking', () => {
  const listPublishedForBooking = jest.fn();
  const getStaffProperty = jest.fn();
  let service: ExtrasService;

  beforeEach(async () => {
    jest.resetAllMocks();
    listPublishedForBooking.mockResolvedValue([PUBLISHED]);
    getStaffProperty.mockResolvedValue({ organizationId: 'org' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExtrasService,
        { provide: ExtrasRepository, useValue: { listPublishedForBooking } },
        { provide: PropertyService, useValue: { getStaffProperty } },
      ],
    }).compile();
    service = moduleRef.get(ExtrasService);
  });

  it('returns the published extras of this property for this organization', async () => {
    await expect(service.listForBooking('prop', 'org')).resolves.toEqual([PUBLISHED]);
    expect(listPublishedForBooking).toHaveBeenCalledWith('prop', 'org');
  });

  it('answers not found, and reads no extras, for a property that does not exist', async () => {
    getStaffProperty.mockRejectedValue(new NotFoundException());

    await expect(service.listForBooking('missing', 'org')).rejects.toBeInstanceOf(NotFoundException);
    expect(listPublishedForBooking).not.toHaveBeenCalled();
  });
});
