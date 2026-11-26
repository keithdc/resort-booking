/**
 * @file apps/api/src/modules/identity/organization-settings-diff.ts
 * @feature identity
 * @dependencies shared-types
 */

import type { OrganizationSettings } from '@resort-booking/shared-types';
import type { AuditMetadata } from '../../shared/audit/audit.types';

type SettingName = Exclude<keyof OrganizationSettings, 'id'>;

/** Where guest payments are made to: a change here is a fraud signal and must be visible (docs/13 R2-06). */
const BANK_FIELDS: readonly SettingName[] = ['iban', 'bic', 'bankAccountName'];
/** Where guest mail and booking notices go: also worth a notice to the other admins. */
const MAIL_FIELDS: readonly SettingName[] = ['bookingEmail', 'guestReplyEmail', 'contactEmail'];

const FIELD_ORDER: readonly SettingName[] = [
  'name',
  'legalName',
  'legalAddress',
  'vatNumber',
  'iban',
  'bic',
  'bankAccountName',
  'contactEmail',
  'contactPhone',
  'ownerName',
  'bookingEmail',
  'guestReplyEmail',
];

/** What a settings save really changed, ready for the audit log. Names only: never a value, never a hash of one. */
export interface SettingsChange {
  /** Every field whose value changed, sorted. */
  fields: SettingName[];
  /** The changed fields that decide where money or mail goes (bank details, booking and reply emails). */
  sensitiveFields: SettingName[];
  bankDetailsChanged: boolean;
  mailRoutingChanged: boolean;
}

/** A bank number is the same number with other spacing or case; everything else is compared as typed, trimmed. */
function normalised(name: SettingName, value: string): string {
  const trimmed = value.trim();
  if (name === 'iban' || name === 'bic') {
    return trimmed.replace(/\s+/g, '').toUpperCase();
  }
  if (MAIL_FIELDS.includes(name)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

/**
 * Compares the saved settings with the new ones and names what changed. A change of only spacing in an IBAN is not a
 * change. The values themselves never leave this function.
 */
export function diffOrganizationSettings(before: OrganizationSettings, after: Omit<OrganizationSettings, 'id'>): SettingsChange {
  const fields = FIELD_ORDER.filter((name: SettingName): boolean => normalised(name, before[name]) !== normalised(name, after[name]));
  const sensitiveFields = fields.filter((name: SettingName): boolean => BANK_FIELDS.includes(name) || MAIL_FIELDS.includes(name));
  return {
    fields: [...fields].sort(),
    sensitiveFields: [...sensitiveFields].sort(),
    bankDetailsChanged: fields.some((name: SettingName): boolean => BANK_FIELDS.includes(name)),
    mailRoutingChanged: fields.some((name: SettingName): boolean => name === 'bookingEmail' || name === 'guestReplyEmail'),
  };
}

/**
 * The audit metadata for a settings change. `notice` is the signal a future "your bank details changed" mail reads:
 * `bank_details_changed` first (the most serious), then `mail_routing_changed`, else null.
 */
export function settingsAuditMetadata(change: SettingsChange): AuditMetadata {
  return {
    fields: change.fields,
    sensitiveFields: change.sensitiveFields,
    changedCount: change.fields.length,
    bankDetailsChanged: change.bankDetailsChanged,
    mailRoutingChanged: change.mailRoutingChanged,
    notice: change.bankDetailsChanged ? 'bank_details_changed' : change.mailRoutingChanged ? 'mail_routing_changed' : null,
  };
}
