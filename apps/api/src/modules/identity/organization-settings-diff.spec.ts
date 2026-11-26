/**
 * @file apps/api/src/modules/identity/organization-settings-diff.spec.ts
 * @feature identity
 * Which fields a settings save really changed, and the audit metadata that carries it (docs/13 R2-06).
 */

import type { OrganizationSettings } from '@resort-booking/shared-types';
import { diffOrganizationSettings, settingsAuditMetadata } from './organization-settings-diff';

const BEFORE: OrganizationSettings = {
  id: 'org-1',
  name: 'Humphreys',
  legalName: 'Humphreys SARL',
  legalAddress: '1 Rue du Lac, Annecy',
  vatNumber: 'FR123',
  iban: 'FR76 3000 6000 0112 3456 7890 189',
  bic: 'AGRIFRPP',
  bankAccountName: 'Humphreys SARL',
  contactEmail: 'hello@example.com',
  contactPhone: '+33612345678',
  ownerName: 'Ada',
  bookingEmail: 'booking@example.com',
  guestReplyEmail: 'reply@example.com',
};

function asRequest(settings: OrganizationSettings): Omit<OrganizationSettings, 'id'> {
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

function saveWith(changes: Partial<Omit<OrganizationSettings, 'id'>>): Omit<OrganizationSettings, 'id'> {
  return { ...asRequest(BEFORE), ...changes };
}

describe('diffOrganizationSettings', () => {
  it('names nothing when the save changes nothing (the form always sends every field)', () => {
    expect(diffOrganizationSettings(BEFORE, saveWith({}))).toEqual({
      fields: [],
      sensitiveFields: [],
      bankDetailsChanged: false,
      mailRoutingChanged: false,
    });
  });

  it('names only the fields that changed, sorted', () => {
    const change = diffOrganizationSettings(BEFORE, saveWith({ ownerName: 'Grace', contactPhone: '+33700000000', name: 'Humphreys Lake' }));

    expect(change.fields).toEqual(['contactPhone', 'name', 'ownerName']);
    expect(change.sensitiveFields).toEqual([]);
    expect(change.bankDetailsChanged).toBe(false);
  });

  it.each(['iban', 'bic', 'bankAccountName'] as const)('flags a change of %s as a bank-details change', (field) => {
    const change = diffOrganizationSettings(BEFORE, saveWith({ [field]: 'FR00 NEW 0000' }));

    expect(change.fields).toEqual([field]);
    expect(change.sensitiveFields).toEqual([field]);
    expect(change.bankDetailsChanged).toBe(true);
  });

  it('flags the booking and guest reply emails as mail routing, and the contact email as sensitive only', () => {
    expect(diffOrganizationSettings(BEFORE, saveWith({ bookingEmail: 'thief@example.com' }))).toMatchObject({
      sensitiveFields: ['bookingEmail'],
      mailRoutingChanged: true,
      bankDetailsChanged: false,
    });
    expect(diffOrganizationSettings(BEFORE, saveWith({ guestReplyEmail: 'thief@example.com' })).mailRoutingChanged).toBe(true);
    expect(diffOrganizationSettings(BEFORE, saveWith({ contactEmail: 'other@example.com' }))).toMatchObject({
      sensitiveFields: ['contactEmail'],
      mailRoutingChanged: false,
    });
  });

  it('does not call re-spacing or re-casing an IBAN, a BIC or an email a change', () => {
    const change = diffOrganizationSettings(
      BEFORE,
      saveWith({ iban: 'fr7630006000011234567890189', bic: ' agrifrpp ', bookingEmail: 'Booking@Example.com' }),
    );

    expect(change.fields).toEqual([]);
  });

  it('still sees a real change in text hidden behind spaces', () => {
    expect(diffOrganizationSettings(BEFORE, saveWith({ legalAddress: '2 Rue du Lac, Annecy' })).fields).toEqual(['legalAddress']);
  });

  it('can change several things at once, bank details included', () => {
    const change = diffOrganizationSettings(BEFORE, saveWith({ iban: 'DE89 3704 0044 0532 0130 00', name: 'New name', bookingEmail: 'x@example.com' }));

    expect(change.fields).toEqual(['bookingEmail', 'iban', 'name']);
    expect(change.sensitiveFields).toEqual(['bookingEmail', 'iban']);
    expect(change.bankDetailsChanged).toBe(true);
    expect(change.mailRoutingChanged).toBe(true);
  });
});

describe('settingsAuditMetadata', () => {
  it('carries names, counts and flags, and the bank-details notice for a future mail', () => {
    const metadata = settingsAuditMetadata(diffOrganizationSettings(BEFORE, saveWith({ iban: 'DE89 3704 0044 0532 0130 00', ownerName: 'Grace' })));

    expect(metadata).toEqual({
      fields: ['iban', 'ownerName'],
      sensitiveFields: ['iban'],
      changedCount: 2,
      bankDetailsChanged: true,
      mailRoutingChanged: false,
      notice: 'bank_details_changed',
    });
  });

  it('puts the bank notice before the mail notice, and no notice for an ordinary change', () => {
    expect(settingsAuditMetadata(diffOrganizationSettings(BEFORE, saveWith({ bic: 'X', bookingEmail: 'a@b.co' }))).notice).toBe('bank_details_changed');
    expect(settingsAuditMetadata(diffOrganizationSettings(BEFORE, saveWith({ bookingEmail: 'a@b.co' }))).notice).toBe('mail_routing_changed');
    expect(settingsAuditMetadata(diffOrganizationSettings(BEFORE, saveWith({ name: 'x' }))).notice).toBeNull();
  });

  it('never contains a value: not the old IBAN, not the new one, not an email', () => {
    const newIban = 'DE89 3704 0044 0532 0130 00';
    const json = JSON.stringify(settingsAuditMetadata(diffOrganizationSettings(BEFORE, saveWith({ iban: newIban, bookingEmail: 'thief@example.com', bankAccountName: 'Mallory' }))));

    for (const secret of [newIban, '3704', BEFORE.iban, '3000', 'thief@example.com', 'thief', 'Mallory', 'Humphreys SARL']) {
      expect(json).not.toContain(secret);
    }
  });
});
