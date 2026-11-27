/**
 * @file apps/admin/src/features/team/utils/team-messages.test.ts
 * @feature team
 */

import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { inviteUrl, isLastAdminError, teamErrorMessage } from './team-messages';

describe('teamErrorMessage', () => {
  it('explains the last-admin refusal and how to fix it', () => {
    const error = new ApiRequestError('The workspace needs at least one active admin', 409, { code: 'LAST_ADMIN' });
    expect(teamErrorMessage(error)).toContain('Make someone else an admin first');
    expect(isLastAdminError(error)).toBe(true);
  });

  it('keeps the API message for codes it has no wording for', () => {
    expect(teamErrorMessage(new ApiRequestError('Odd', 400, { code: 'SOMETHING' }))).toBe('Odd');
    expect(isLastAdminError(new ApiRequestError('Odd', 409, { code: 'SOMETHING' }))).toBe(false);
  });

  it('explains the refund-access refusals in plain words', () => {
    expect(teamErrorMessage(new ApiRequestError('x', 400, { code: 'REFUND_ACCESS_NOT_FOR_ADMIN' }))).toContain('Admins always have refund access');
    expect(teamErrorMessage(new ApiRequestError('x', 400, { code: 'CANNOT_CHANGE_OWN_REFUND_ACCESS' }))).toContain('your own refund access');
  });

  it('says only admins can do it on a bare 403, and falls back for non-API errors', () => {
    expect(teamErrorMessage(new ApiRequestError('Forbidden', 403))).toBe('Only admins can do this.');
    expect(teamErrorMessage(new Error('x'))).toBe('Something went wrong. Try again.');
  });
});

describe('inviteUrl', () => {
  it('keeps the token after the # so no server, log or Referer header ever sees it', () => {
    const url = inviteUrl('https://admin.example', 'abc');

    expect(new URL(url).pathname).toBe('/invite');
    expect(new URL(url).search).toBe('');
    expect(url.split('#')[0]).not.toContain('abc');
  });

  it('builds the address of the invitation page', () => {
    expect(inviteUrl('https://admin.example', 'abc')).toBe('https://admin.example/invite#token=abc');
  });
});
