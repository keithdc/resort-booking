/**
 * @file apps/admin/src/features/team/utils/audit-labels.ts
 * @feature team
 * @dependencies shared-types
 * Plain-language names for audit actions and a short "details" line from the metadata.
 */

import type { AuditRecord } from '@resort-booking/shared-types';

const ACTION_LABELS: Record<string, string> = {
  'auth.register': 'Created the workspace',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.logout_all': 'Signed out everywhere',
  'auth.profile_changed': 'Changed their profile',
  'auth.password_changed': 'Changed their password',
  'auth.access_reset_completed': 'Finished an access reset',
  'team.invite_created': 'Invited a team member',
  'team.invite_revoked': 'Cancelled an invitation',
  'team.invite_accepted': 'Accepted an invitation',
  'team.access_reset': 'Reset someone’s access',
  'team.role_changed': 'Changed a role',
  'team.refund_access_granted': 'Gave someone refund access',
  'team.refund_access_removed': 'Removed someone’s refund access',
  'team.deactivated': 'Switched a person off',
  'team.reactivated': 'Switched a person back on',
  'org.settings_changed': 'Changed business settings',
  'booking.cancelled_by_staff': 'Cancelled a booking',
  'booking.dates_changed_by_staff': 'Changed booking dates',
  'booking.arrival_changed': 'Updated check-in status',
  'refund.retried': 'Retried a refund',
  'refund.marked_paid': 'Marked a refund as paid',
  'property.created': 'Added a property',
  'property.updated': 'Updated a property',
  'property.configuration_updated': 'Changed property policies',
  'property.request_option_created': 'Added a request option',
  'property.request_option_updated': 'Updated a request option',
  'property.request_option_deleted': 'Removed a request option',
  'house.created': 'Added a stay',
  'house.updated': 'Updated a stay',
  'rate.created': 'Added a rate period',
  'rate.updated': 'Updated a rate period',
  'rate.deleted': 'Removed a rate period',
  'rate.bulk_applied': 'Applied rates to several stays',
  'discount.created': 'Added a discount',
  'discount.updated': 'Updated a discount',
  'discount.deleted': 'Removed a discount',
  'extra.created': 'Added a guest extra',
  'extra.updated': 'Updated a guest extra',
  'extra.deleted': 'Removed a guest extra',
};

/** The filter choices: the API filters by action prefix, so each group is one prefix. */
export interface AuditCategory {
  prefix: string;
  label: string;
}

export const AUDIT_CATEGORIES: AuditCategory[] = [
  { prefix: '', label: 'Everything' },
  { prefix: 'team.', label: 'Team and invitations' },
  { prefix: 'auth.', label: 'Sign-ins and accounts' },
  { prefix: 'booking.', label: 'Bookings' },
  { prefix: 'refund.', label: 'Refunds' },
  { prefix: 'property.', label: 'Properties' },
  { prefix: 'house.', label: 'Stays' },
  { prefix: 'rate.', label: 'Rates' },
  { prefix: 'discount.', label: 'Discounts' },
  { prefix: 'extra.', label: 'Guest extras' },
  { prefix: 'org.', label: 'Business settings' },
];

/**
 * "team.invite_created" becomes "Invited a team member"; an unknown action becomes sentence-case words so a new
 * server-side action is still readable before this list learns it.
 */
export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known !== undefined) {
    return known;
  }
  const words = action.replace(/[._]+/g, ' ').trim();
  return words === '' ? 'Unknown action' : words.charAt(0).toUpperCase() + words.slice(1);
}

/** Who did it: the staff name, or "Unknown" for a sign-in attempt that matched nobody. */
export function actorLabel(record: Pick<AuditRecord, 'staffName' | 'staffUserId'>): string {
  return record.staffName ?? (record.staffUserId === null ? 'Unknown visitor' : 'Removed account');
}

function formatValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value) && value.every((item): boolean => typeof item === 'string')) {
    return (value as string[]).join(', ');
  }
  return null;
}

/**
 * "role: employee · fields: fullName, email": the simple metadata values on one line (nested values are skipped).
 */
export function detailsLine(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([key, value]): string | null => {
      const text = formatValue(value);
      return text === null || text === '' ? null : `${key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase()}: ${text}`;
    })
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/**
 * The API's `to` is exclusive, the screen's "To" date is inclusive: send the day after.
 */
export function exclusiveEnd(inclusiveDate: string): string {
  const day = new Date(`${inclusiveDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
