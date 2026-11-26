/**
 * @file apps/api/src/shared/validation/password-validation-pipe.spec.ts
 * @shared A weak password through the app's real ValidationPipe: 400 PASSWORD_TOO_WEAK with the problems
 */

import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ChangeStaffPasswordDto } from '../../modules/identity/dto/change-staff-password.dto';
import { StaffLoginDto } from '../../modules/identity/dto/staff-login.dto';
import { apiValidationPipeOptions } from './validation-exception.factory';

const pipe = new ValidationPipe(apiValidationPipeOptions());

async function run(type: new () => object, payload: object): Promise<unknown> {
  try {
    return await pipe.transform(payload, { type: 'body', metatype: type });
  } catch (error: unknown) {
    return error;
  }
}

describe('password rule through the global validation pipe', () => {
  it('accepts a good new password', async () => {
    const result = await run(ChangeStaffPasswordDto, { currentPassword: 'old-password-1', newPassword: 'Lakeside-Morning-8' });

    expect(result).toBeInstanceOf(ChangeStaffPasswordDto);
  });

  it('answers a weak new password with code PASSWORD_TOO_WEAK and every problem', async () => {
    const error = await run(ChangeStaffPasswordDto, { currentPassword: 'old-password-1', newPassword: 'password' });

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'PASSWORD_TOO_WEAK',
      problems: ['Use at least 10 characters', 'Add a capital letter', 'Add a number', 'This is a very common password. Choose something less guessable'],
    });
  });

  it('never echoes the rejected password back', async () => {
    const error = await run(ChangeStaffPasswordDto, { currentPassword: 'old-password-1', newPassword: 'hunter2hunter2' });

    expect(JSON.stringify((error as BadRequestException).getResponse())).not.toContain('hunter2hunter2');
  });

  it('does not judge the CURRENT password: existing accounts keep logging in and can confirm an old password', async () => {
    const change = await run(ChangeStaffPasswordDto, { currentPassword: 'abc', newPassword: 'Lakeside-Morning-8' });
    const login = await run(StaffLoginDto, { email: 'boss@example.com', password: 'abc' });

    expect(change).toBeInstanceOf(ChangeStaffPasswordDto);
    expect(login).toBeInstanceOf(StaffLoginDto);
  });

  it('refuses a new password over 200 characters, as before', async () => {
    const error = await run(ChangeStaffPasswordDto, { currentPassword: 'old-password-1', newPassword: `Aa1${'x'.repeat(198)}` });

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('keeps Nest\'s usual 400 shape for every other validation error', async () => {
    const error = await run(ChangeStaffPasswordDto, { newPassword: 'Lakeside-Morning-8' });

    const response = (error as BadRequestException).getResponse() as { message: string[]; error: string };
    expect(response.error).toBe('Bad Request');
    expect(response.message.join(' ')).toContain('currentPassword');
  });
});
