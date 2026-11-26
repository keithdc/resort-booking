/**
 * @file apps/api/src/modules/property/property-slug.spec.ts
 * @feature property
 * @dependencies PropertyService, PropertyRepository
 *
 * R2-02: a public slug belongs to exactly one property in the whole deployment.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreatePropertyRequest, PropertyDetail, UpdatePropertyRequest } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { GeocodeService } from './geocode.service';
import { PropertyRepository } from './property.repository';
import { isSlugViolation, PropertyService } from './property.service';

const CREATE: CreatePropertyRequest = {
  name: 'Beach House',
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
const UPDATE: UpdatePropertyRequest = { ...CREATE, slug: 'beach-house' };
const DETAIL = { id: 'p1', organizationId: 'org-A' } as PropertyDetail;

function violation(constraint: string): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505', constraint });
}

describe('PropertyService slugs are unique across organizations', () => {
  const slugTaken = jest.fn<Promise<boolean>, [string, string | null]>();
  const createProperty = jest.fn<Promise<PropertyDetail>, [string, CreatePropertyRequest]>();
  const updateProperty = jest.fn<Promise<PropertyDetail | null>, [string, UpdatePropertyRequest]>();
  const getProperty = jest.fn();
  let service: PropertyService;

  beforeEach(async () => {
    jest.resetAllMocks();
    slugTaken.mockResolvedValue(false);
    createProperty.mockResolvedValue(DETAIL);
    updateProperty.mockResolvedValue(DETAIL);
    getProperty.mockResolvedValue(DETAIL);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PropertyService,
        {
          provide: PropertyRepository,
          useValue: { slugTaken, createProperty, updateProperty, getPropertyBySlug: getProperty, getPropertyById: getProperty },
        },
        { provide: GeocodeService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PropertyService);
  });

  it('creates with a typed slug that nobody uses', async () => {
    await service.createStaffProperty('org-B', { ...CREATE, slug: 'sea-view' });

    expect(slugTaken).toHaveBeenCalledWith('sea-view', null);
    expect(createProperty.mock.calls[0]?.[1].slug).toBe('sea-view');
  });

  it('answers 409 SLUG_TAKEN when a typed slug is used by another workspace, and creates nothing', async () => {
    slugTaken.mockResolvedValue(true);

    await expect(service.createStaffProperty('org-B', { ...CREATE, slug: 'beach-house' })).rejects.toMatchObject({
      response: { code: 'SLUG_TAKEN', message: expect.stringContaining('already used') },
    });
    await expect(service.createStaffProperty('org-B', { ...CREATE, slug: 'beach-house' })).rejects.toBeInstanceOf(ConflictException);
    expect(createProperty).not.toHaveBeenCalled();
  });

  it('a slug made from the name gets a suffix when taken, so a plain name still works', async () => {
    slugTaken.mockResolvedValueOnce(true).mockResolvedValue(false);

    await service.createStaffProperty('org-B', CREATE);

    expect(slugTaken).toHaveBeenNthCalledWith(1, 'beach-house', null);
    expect(createProperty.mock.calls[0]?.[1].slug).toMatch(/^beach-house-[a-z0-9]+$/);
  });

  it('turns a database unique violation (a race) into the same 409', async () => {
    createProperty.mockRejectedValue(violation('properties_slug_lower_key'));
    await expect(service.createStaffProperty('org-B', { ...CREATE, slug: 'x-y' })).rejects.toMatchObject({ response: { code: 'SLUG_TAKEN' } });

    createProperty.mockRejectedValue(violation('properties_organization_id_slug_key'));
    await expect(service.createStaffProperty('org-B', { ...CREATE, slug: 'x-y' })).rejects.toMatchObject({ response: { code: 'SLUG_TAKEN' } });
  });

  it('does not hide other database errors as a slug problem', async () => {
    createProperty.mockRejectedValue(violation('properties_pkey'));

    await expect(service.createStaffProperty('org-B', { ...CREATE, slug: 'x-y' })).rejects.not.toMatchObject({ response: { code: 'SLUG_TAKEN' } });
  });

  it('update excludes the property itself, so keeping its own slug is fine', async () => {
    await service.updateStaffProperty('p1', UPDATE);

    expect(slugTaken).toHaveBeenCalledWith('beach-house', 'p1');
    expect(updateProperty).toHaveBeenCalled();
  });

  it('update answers 409 SLUG_TAKEN when the new slug belongs to another property, and writes nothing', async () => {
    slugTaken.mockResolvedValue(true);

    await expect(service.updateStaffProperty('p1', UPDATE)).rejects.toMatchObject({ response: { code: 'SLUG_TAKEN' } });
    expect(updateProperty).not.toHaveBeenCalled();
  });

  it('update turns a race violation into 409 and a missing row into 404', async () => {
    updateProperty.mockRejectedValue(violation('properties_slug_lower_key'));
    await expect(service.updateStaffProperty('p1', UPDATE)).rejects.toMatchObject({ response: { code: 'SLUG_TAKEN' } });

    updateProperty.mockResolvedValue(null);
    await expect(service.updateStaffProperty('p1', UPDATE)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('isSlugViolation', () => {
  it('recognises only the two slug constraints', () => {
    expect(isSlugViolation(violation('properties_slug_lower_key'))).toBe(true);
    expect(isSlugViolation(violation('properties_organization_id_slug_key'))).toBe(true);
    expect(isSlugViolation(violation('properties_pkey'))).toBe(false);
    expect(isSlugViolation(new Error('x'))).toBe(false);
    expect(isSlugViolation(null)).toBe(false);
    expect(isSlugViolation('23505')).toBe(false);
  });
});

describe('PropertyRepository.slugTaken', () => {
  const query = jest.fn<Promise<{ rows: Array<{ exists: boolean }> }>, [string, unknown[]?]>();
  let repository: PropertyRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [{ exists: true }] });
    const moduleRef = await Test.createTestingModule({
      providers: [PropertyRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(PropertyRepository);
  });

  it('looks across every organization, ignoring case, and excludes only the property itself', async () => {
    await expect(repository.slugTaken('Beach-House', 'p1')).resolves.toBe(true);

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('lower(slug) = lower($1)');
    expect(sql).not.toContain('organization_id');
    expect(query.mock.calls[0]?.[1]).toEqual(['Beach-House', 'p1']);
  });

  it('is false when nothing matches', async () => {
    query.mockResolvedValue({ rows: [{ exists: false }] });

    await expect(repository.slugTaken('free-slug', null)).resolves.toBe(false);
  });
});
