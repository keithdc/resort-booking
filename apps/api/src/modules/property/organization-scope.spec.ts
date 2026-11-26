/**
 * @file apps/api/src/modules/property/organization-scope.spec.ts
 * @feature property
 *
 * The staff catalog and new properties are tied to the caller's organization.
 */

import { Test } from '@nestjs/testing';
import type { PropertyDetail, PropertySummary, CreatePropertyRequest } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { GeocodeService } from './geocode.service';
import { PropertyRepository } from './property.repository';
import { PropertyService } from './property.service';

describe('PropertyService staff catalog is scoped to the caller organization', () => {
  const listProperties = jest.fn<Promise<PropertySummary[]>, [boolean, (string | null)?]>();
  const createProperty = jest.fn<Promise<PropertyDetail>, [string, CreatePropertyRequest]>();
  const slugTaken = jest.fn<Promise<boolean>, [string, string | null]>();
  let service: PropertyService;

  const REQUEST: CreatePropertyRequest = {
    name: 'Lake House',
    slug: '',
    description: '',
    addressLine: '1 Rue',
    postalCode: '74000',
    city: 'Annecy',
    countryCode: 'FR',
    timezone: 'Europe/Paris',
    latitude: 45.9,
    longitude: 6.1,
    phone: '+33100000000',
    email: 'a@example.com',
    published: false,
    customRequestsEnabled: false,
    photos: [],
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    listProperties.mockResolvedValue([]);
    slugTaken.mockResolvedValue(false);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PropertyService,
        { provide: PropertyRepository, useValue: { listProperties, createProperty, slugTaken } },
        { provide: GeocodeService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PropertyService);
  });

  it('lists only the properties of the organization it is given', async () => {
    await service.listStaffProperties('org-B');

    expect(listProperties).toHaveBeenCalledWith(false, 'org-B');
  });

  it('lists the public catalog without an organization (the guest site shows published properties)', async () => {
    await service.listPublishedProperties();

    expect(listProperties).toHaveBeenCalledWith(true);
  });

  it('creates a property in the organization it is given, not in "the first one"', async () => {
    const created: PropertyDetail = { id: 'p1', organizationId: 'org-B' } as PropertyDetail;
    createProperty.mockResolvedValue(created);

    await expect(service.createStaffProperty('org-B', REQUEST)).resolves.toBe(created);

    expect(slugTaken.mock.calls[0]).toEqual(['lake-house', null]);
    expect(createProperty.mock.calls[0]?.[0]).toBe('org-B');
  });
});

describe('PropertyRepository.listProperties', () => {
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  let repository: PropertyRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [PropertyRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(PropertyRepository);
  });

  it('filters by organization when staff ask', async () => {
    await repository.listProperties(false, 'org-B');

    expect(query.mock.calls[0]?.[0]).toContain('p.organization_id = $2::uuid');
    expect(query.mock.calls[0]?.[1]).toEqual([false, 'org-B']);
  });

  it('does not filter by organization for the public catalog, but only shows published ones', async () => {
    await repository.listProperties(true);

    expect(query.mock.calls[0]?.[1]).toEqual([true, null]);
  });
});
