/**
 * @file apps/api/src/modules/identity/organization-scope.spec.ts
 * @feature identity
 *
 * Bank and legal details belong to ONE organization: staff reach only their own.
 */

import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { OrganizationSettings, UpdateOrganizationSettingsRequest } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { IdentityRepository } from './identity.repository';
import { AuditService } from '../../shared/audit/audit.service';
import { IdentityService } from './identity.service';
import { LoginLimiter } from './login-limiter';
import { TwoFactorService } from './two-factor.service';
import type { StaffAccount } from '../../shared/roles/staff-role';

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

function asRequest(settings: OrganizationSettings): UpdateOrganizationSettingsRequest {
  return {
    name: settings.name,
    legalName: settings.legalName,
    legalAddress: settings.legalAddress,
    vatNumber: settings.vatNumber,
    iban: settings.iban,
    bic: settings.bic,
    bankAccountName: settings.bankAccountName,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    ownerName: settings.ownerName,
    bookingEmail: settings.bookingEmail,
    guestReplyEmail: settings.guestReplyEmail,
  };
}

const PROOF = {
  staff: { id: 's1', organizationId: 'org-B', role: 'admin' } as StaffAccount,
  context: { ip: '203.0.113.9', requestId: 'req-1' },
};

describe('IdentityService organization settings are scoped to the caller', () => {
  const getSettings = jest.fn<Promise<OrganizationSettings | null>, [(string | null)?]>();
  const updateSettings = jest.fn<Promise<OrganizationSettings | null>, [string, Omit<OrganizationSettings, 'id'>]>();
  const reauthenticate = jest.fn<Promise<void>, [unknown, string | undefined, string | undefined, unknown, string]>();
  let service: IdentityService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: IdentityRepository, useValue: { getSettings, updateSettings } },
        { provide: ConfigService, useValue: { get: (): undefined => undefined } },
        { provide: LoginLimiter, useValue: {} },
        { provide: TwoFactorService, useValue: { reauthenticate } },
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

    const saved = await service.updateSettings(request, 'org-B');

    expect(getSettings).toHaveBeenCalledWith('org-B');
    expect(updateSettings).toHaveBeenCalledWith('org-B', request);
    expect(saved.settings).toEqual(SETTINGS);
    expect(saved.audit).toMatchObject({ fields: [], bankDetailsChanged: false, notice: null });
  });

  it('answers the names of what changed, with the bank-details notice, and logs the sensitive names (never values)', async () => {
    getSettings.mockResolvedValue(SETTINGS);
    updateSettings.mockResolvedValue({ ...SETTINGS, iban: 'DE89 3704 0044 0532 0130 00' });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    const unchanged = asRequest(SETTINGS);

    reauthenticate.mockResolvedValue(undefined);
    const saved = await service.updateSettings({ ...unchanged, iban: 'DE89 3704 0044 0532 0130 00', ownerName: 'Grace', currentPassword: 'old-pass-1' }, 'org-B', PROOF);

    expect(saved.audit).toMatchObject({ fields: ['iban', 'ownerName'], sensitiveFields: ['iban'], bankDetailsChanged: true, notice: 'bank_details_changed' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sensitive fields: iban'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('3704');
    warn.mockRestore();
  });

  it('asks for the current password before bank details or an email address change, and saves nothing without it', async () => {
    getSettings.mockResolvedValue(SETTINGS);
    const unchanged = asRequest(SETTINGS);

    await expect(service.updateSettings({ ...unchanged, iban: 'DE89 3704 0044 0532 0130 00' }, 'org-B')).rejects.toMatchObject({ response: { code: 'REAUTH_REQUIRED' } });
    reauthenticate.mockRejectedValueOnce(new ForbiddenException({ message: 'x', code: 'REAUTH_REQUIRED' }));
    await expect(service.updateSettings({ ...unchanged, bookingEmail: 'new@example.com' }, 'org-B', PROOF)).rejects.toBeInstanceOf(ForbiddenException);

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('proves it is the signed-in person with the password and the code, for the staff member making the change', async () => {
    getSettings.mockResolvedValue(SETTINGS);
    updateSettings.mockResolvedValue({ ...SETTINGS, guestReplyEmail: 'new@example.com' });
    reauthenticate.mockResolvedValue(undefined);

    await service.updateSettings({ ...asRequest(SETTINGS), guestReplyEmail: 'new@example.com', currentPassword: 'old-pass-1', twoFactorCode: '123456' }, 'org-B', PROOF);

    expect(reauthenticate).toHaveBeenCalledWith(PROOF.staff, 'old-pass-1', '123456', PROOF.context, 'org_settings');
  });

  it('does not ask again for a change that touches neither bank details nor an email address', async () => {
    getSettings.mockResolvedValue(SETTINGS);
    updateSettings.mockResolvedValue({ ...SETTINGS, ownerName: 'Grace' });

    await service.updateSettings({ ...asRequest(SETTINGS), ownerName: 'Grace' }, 'org-B');

    expect(reauthenticate).not.toHaveBeenCalled();
  });

  it('does not save and does not log when the organization is gone', async () => {
    getSettings.mockResolvedValue(SETTINGS);
    updateSettings.mockResolvedValue(null);
    const unchanged = asRequest(SETTINGS);

    await expect(service.updateSettings({ ...unchanged, name: 'x' }, 'org-B')).rejects.toBeInstanceOf(NotFoundException);
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
