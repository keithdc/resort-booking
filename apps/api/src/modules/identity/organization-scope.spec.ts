/**
 * @file apps/api/src/modules/identity/organization-scope.spec.ts
 * @feature identity
 *
 * Bank and legal details belong to ONE organization: staff reach only their own.
 */

import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { OrganizationSettings, UpdateOrganizationSettingsRequest } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { IdentityRepository } from './identity.repository';
import { AuditService } from '../../shared/audit/audit.service';
import { IdentityService } from './identity.service';
import { LoginLimiter } from './login-limiter';
import { TwoFactorService } from './two-factor.service';

const SETTINGS: OrganizationSettings = {
  id: 'org-B',
  name: 'Org B',
  legalName: 'Org B SARL',
  legalAddress: '1 Rue',
  vatNumber: 'FR1',
  iban: 'FR76 0000',
  bic: 'BIC',
  bankAccountName: 'Org B',
  contactEmail: 'b@example.com',
  contactPhone: '+33100000000',
  ownerName: 'B',
  bookingEmail: 'booking@example.com',
  guestReplyEmail: 'reply@example.com',
};

describe('IdentityService organization settings are scoped to the caller', () => {
  const getSettings = jest.fn<Promise<OrganizationSettings | null>, [(string | null)?]>();
  const updateSettings = jest.fn<Promise<OrganizationSettings | null>, [string, Omit<OrganizationSettings, 'id'>]>();
  let service: IdentityService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: IdentityRepository, useValue: { getSettings, updateSettings } },
        { provide: ConfigService, useValue: { get: (): undefined => undefined } },
        { provide: LoginLimiter, useValue: {} },
        { provide: TwoFactorService, useValue: {} },
        { provide: AuditService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(IdentityService);
  });

  it('reads the settings of the organization it is given, never "the first one"', async () => {
    getSettings.mockResolvedValue(SETTINGS);

    await service.getSettings('org-B');

    expect(getSettings).toHaveBeenCalledWith('org-B');
  });

  it('answers 404 when that organization has no settings row', async () => {
    getSettings.mockResolvedValue(null);

    await expect(service.getSettings('org-X')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('saves only into the organization it is given', async () => {
    getSettings.mockResolvedValue(SETTINGS);
    updateSettings.mockResolvedValue(SETTINGS);
    const request: UpdateOrganizationSettingsRequest = {
      name: SETTINGS.name,
      legalName: SETTINGS.legalName,
      legalAddress: SETTINGS.legalAddress,
      vatNumber: SETTINGS.vatNumber,
      iban: SETTINGS.iban,
      bic: SETTINGS.bic,
      bankAccountName: SETTINGS.bankAccountName,
      contactEmail: SETTINGS.contactEmail,
      contactPhone: SETTINGS.contactPhone,
      ownerName: SETTINGS.ownerName,
      bookingEmail: SETTINGS.bookingEmail,
      guestReplyEmail: SETTINGS.guestReplyEmail,
    };

    await service.updateSettings(request, 'org-B');

    expect(getSettings).toHaveBeenCalledWith('org-B');
    expect(updateSettings).toHaveBeenCalledWith('org-B', request);
  });
});

describe('IdentityRepository.getSettings', () => {
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>();
  let repository: IdentityRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [IdentityRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(IdentityRepository);
  });

  it('filters by the organization id when one is given', async () => {
    await repository.getSettings('org-B');

    expect(query.mock.calls[0]?.[0]).toContain('id = $1::uuid');
    expect(query.mock.calls[0]?.[1]).toEqual(['org-B']);
  });

  it('reads the first organization only when no one is signed in (public site, first boot)', async () => {
    await repository.getSettings();

    expect(query.mock.calls[0]?.[1]).toEqual([null]);
  });
});
