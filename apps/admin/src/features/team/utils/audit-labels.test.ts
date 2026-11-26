/**
 * @file apps/admin/src/features/team/utils/audit-labels.test.ts
 * @feature team
 */

import { describe, expect, it } from 'vitest';
import { actionLabel, actorLabel, detailsLine, exclusiveEnd } from './audit-labels';

describe('actionLabel', () => {
  it('names the known actions in plain words', () => {
    expect(actionLabel('team.invite_created')).toBe('Invited a team member');
    expect(actionLabel('refund.marked_paid')).toBe('Marked a refund as paid');
  });

  it('makes an unknown action readable instead of showing the code', () => {
    expect(actionLabel('widget.frobnicated_twice')).toBe('Widget frobnicated twice');
    expect(actionLabel('')).toBe('Unknown action');
  });
});

describe('actorLabel', () => {
  it('uses the name, then tells a removed account from an unknown visitor', () => {
    expect(actorLabel({ staffName: 'Marie', staffUserId: 's1' })).toBe('Marie');
    expect(actorLabel({ staffName: null, staffUserId: 's1' })).toBe('Removed account');
    expect(actorLabel({ staffName: null, staffUserId: null })).toBe('Unknown visitor');
  });
});

describe('detailsLine', () => {
  it('joins simple values and skips nested ones and blanks', () => {
    expect(detailsLine({ role: 'employee', fields: ['fullName', 'email'], nested: { a: 1 }, blank: '', ok: true })).toBe(
      'role: employee · fields: fullName, email · ok: true',
    );
  });

  it('is empty without metadata', () => {
    expect(detailsLine({})).toBe('');
  });
});

describe('exclusiveEnd', () => {
  it('adds a day, across month and year ends', () => {
    expect(exclusiveEnd('2026-01-31')).toBe('2026-02-01');
    expect(exclusiveEnd('2026-12-31')).toBe('2027-01-01');
  });
});
