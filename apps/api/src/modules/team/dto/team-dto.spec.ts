/**
 * @file apps/api/src/modules/team/dto/team-dto.spec.ts
 * @feature team
 * The team DTOs through the app's real ValidationPipe (no implicit conversion): sizes, shapes, no extras.
 */

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { LIMITS } from '../../../shared/validation/limits';
import { apiValidationPipeOptions } from '../../../shared/validation/validation-exception.factory';
import { AcceptInviteDto } from './accept-invite.dto';
import { AuditQueryDto } from './audit-query.dto';
import { CreateInviteDto } from './create-invite.dto';
import { RegisterDto } from './register.dto';
import { ResetAccessDto } from './reset-access.dto';
import { UpdateMemberDto } from './update-member.dto';

const pipe = new ValidationPipe(apiValidationPipeOptions());

async function run<T extends object>(type: new () => T, payload: object, source: 'body' | 'query' = 'body'): Promise<T | Error> {
  try {
    return (await pipe.transform(payload, { type: source, metatype: type })) as T;
  } catch (error: unknown) {
    return error as Error;
  }
}

const accepted = (result: unknown): boolean => !(result instanceof Error);
const TOKEN = 'd'.repeat(64);

describe('RegisterDto', () => {
  const good = { organizationName: 'Humphreys', fullName: 'Ada Lovelace', email: 'ada@example.com', password: 'Correct-Horse-9' };

  it('accepts a normal registration', async () => {
    expect(accepted(await run(RegisterDto, good))).toBe(true);
  });

  it.each([
    ['a missing field', { ...good, email: undefined }],
    ['a bad email', { ...good, email: 'not-an-email' }],
    ['a one-letter name', { ...good, fullName: 'A' }],
    ['a name over the limit', { ...good, organizationName: 'x'.repeat(LIMITS.name + 1) }],
    ['an email over the limit', { ...good, email: `${'x'.repeat(LIMITS.email)}@example.com` }],
    ['an empty password', { ...good, password: '' }],
    ['a password over the limit', { ...good, password: 'x'.repeat(LIMITS.password + 1) }],
    ['an extra field (no way to smuggle a role in)', { ...good, role: 'admin' }],
    ['a role field', { ...good, organizationId: 'o1' }],
  ])('refuses %s', async (_label, payload) => {
    expect(accepted(await run(RegisterDto, payload))).toBe(false);
  });
});

describe('CreateInviteDto', () => {
  const good = { email: 'new@example.com', fullName: 'New Person', role: 'employee' };

  it('accepts an employee and an admin', async () => {
    expect(accepted(await run(CreateInviteDto, good))).toBe(true);
    expect(accepted(await run(CreateInviteDto, { ...good, role: 'admin' }))).toBe(true);
  });

  it.each([
    ['an unknown role', { ...good, role: 'owner' }],
    ['no role', { email: good.email, fullName: good.fullName }],
    ['a bad email', { ...good, email: 'nope' }],
    ['a name over the limit', { ...good, fullName: 'x'.repeat(LIMITS.name + 1) }],
    ['an extra field', { ...good, organizationId: 'o2' }],
  ])('refuses %s', async (_label, payload) => {
    expect(accepted(await run(CreateInviteDto, payload))).toBe(false);
  });
});

describe('canManageRefunds (refund access) on CreateInviteDto and UpdateMemberDto', () => {
  const good = { email: 'new@example.com', fullName: 'New Person', role: 'employee' };

  it('accepts a real boolean, or nothing', async () => {
    expect(accepted(await run(CreateInviteDto, { ...good, canManageRefunds: true }))).toBe(true);
    expect(accepted(await run(CreateInviteDto, { ...good, canManageRefunds: false }))).toBe(true);
    expect(accepted(await run(UpdateMemberDto, { canManageRefunds: true }))).toBe(true);
    expect(accepted(await run(UpdateMemberDto, { canManageRefunds: false }))).toBe(true);
  });

  it.each([['"true" as text', 'true'], ['"false" as text', 'false'], ['1', 1], ['an object', {}]])('refuses %s (no loose conversion)', async (_label, value) => {
    expect(accepted(await run(CreateInviteDto, { ...good, canManageRefunds: value }))).toBe(false);
    expect(accepted(await run(UpdateMemberDto, { canManageRefunds: value }))).toBe(false);
  });

  it('keeps a real JSON false as false', async () => {
    expect(await run(UpdateMemberDto, { canManageRefunds: false })).toMatchObject({ canManageRefunds: false });
  });
});

describe('sendEmail on CreateInviteDto and ResetAccessDto', () => {
  const good = { email: 'new@example.com', fullName: 'New Person', role: 'employee' };

  it('accepts a real boolean, or nothing', async () => {
    expect(accepted(await run(CreateInviteDto, { ...good, sendEmail: true }))).toBe(true);
    expect(accepted(await run(CreateInviteDto, { ...good, sendEmail: false }))).toBe(true);
    expect(accepted(await run(ResetAccessDto, {}))).toBe(true);
    expect(accepted(await run(ResetAccessDto, { sendEmail: true }))).toBe(true);
  });

  it.each([['"yes"', 'yes'], ['the string "false"', 'false'], ['1', 1]])('refuses %s', async (_label, value) => {
    expect(accepted(await run(CreateInviteDto, { ...good, sendEmail: value }))).toBe(false);
    expect(accepted(await run(ResetAccessDto, { sendEmail: value }))).toBe(false);
  });

  it('refuses extra fields on a reset', async () => {
    expect(accepted(await run(ResetAccessDto, { sendEmail: true, role: 'admin' }))).toBe(false);
  });
});

describe('UpdateMemberDto', () => {
  it('accepts a role, a switch, or both', async () => {
    expect(accepted(await run(UpdateMemberDto, { role: 'admin' }))).toBe(true);
    expect(accepted(await run(UpdateMemberDto, { active: false }))).toBe(true);
    expect(accepted(await run(UpdateMemberDto, { role: 'employee', active: true }))).toBe(true);
  });

  it.each([
    ['an unknown role', { role: 'owner' }],
    ['"false" as text for active (no loose conversion)', { active: 'false' }],
    ['"yes" for active', { active: 'yes' }],
    ['1 for active', { active: 1 }],
    ['an extra field', { role: 'admin', email: 'x@example.com' }],
  ])('refuses %s', async (_label, payload) => {
    expect(accepted(await run(UpdateMemberDto, payload))).toBe(false);
  });

  it('keeps a real JSON false as false', async () => {
    const result = await run(UpdateMemberDto, { active: false });

    expect(result).toMatchObject({ active: false });
  });
});

describe('AcceptInviteDto', () => {
  it('accepts a 64-character hex token with a password, and an optional name', async () => {
    expect(accepted(await run(AcceptInviteDto, { token: TOKEN, password: 'Correct-Horse-9' }))).toBe(true);
    expect(accepted(await run(AcceptInviteDto, { token: TOKEN, password: 'Correct-Horse-9', fullName: 'Chosen Name' }))).toBe(true);
  });

  it.each([
    ['a short token', { token: 'abc', password: 'Correct-Horse-9' }],
    ['a non-hex token', { token: 'z'.repeat(64), password: 'Correct-Horse-9' }],
    ['an upper-case token', { token: 'D'.repeat(64), password: 'Correct-Horse-9' }],
    ['no password', { token: TOKEN }],
    ['a password over the limit', { token: TOKEN, password: 'x'.repeat(LIMITS.password + 1) }],
    ['a name over the limit', { token: TOKEN, password: 'Correct-Horse-9', fullName: 'x'.repeat(LIMITS.name + 1) }],
    ['an extra field', { token: TOKEN, password: 'Correct-Horse-9', role: 'admin' }],
  ])('refuses %s', async (_label, payload) => {
    expect(accepted(await run(AcceptInviteDto, payload))).toBe(false);
  });
});

describe('AuditQueryDto', () => {
  it('accepts no filters, and each filter alone or together', async () => {
    expect(accepted(await run(AuditQueryDto, {}, 'query'))).toBe(true);
    expect(accepted(await run(AuditQueryDto, { action: 'team.', from: '2026-11-01', to: '2026-12-01T00:00:00Z', cursor: 'abc', limit: '20' }, 'query'))).toBe(true);
  });

  it.each([
    ['an action with SQL wildcards', { action: 'team%' }],
    ['an action with quotes', { action: "x' OR '1'='1" }],
    ['an upper-case action', { action: 'TEAM.' }],
    ['a date that is not a date', { from: 'yesterday' }],
    ['a limit over 100', { limit: '1000' }],
    ['a limit of 0', { limit: '0' }],
    ['a limit that is not a number', { limit: 'many' }],
    ['a cursor over 200 characters', { cursor: 'x'.repeat(201) }],
    ['an unknown filter', { organizationId: 'o2' }],
  ])('refuses %s', async (_label, payload) => {
    expect(accepted(await run(AuditQueryDto, payload, 'query'))).toBe(false);
  });
});
