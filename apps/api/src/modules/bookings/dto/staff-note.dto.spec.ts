/**
 * @file apps/api/src/modules/bookings/dto/staff-note.dto.spec.ts
 * @feature bookings
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStaffNoteDto } from './staff-note.dto';

async function errorsFor(body: unknown): Promise<string[]> {
  const dto = plainToInstance(CreateStaffNoteDto, body);
  return (await validate(dto)).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('CreateStaffNoteDto', () => {
  it('accepts a normal note, newlines and tabs, and trims the edges', async () => {
    expect(await errorsFor({ body: '  Deposit 50 EUR\nArrives late\tafter 22:00  ' })).toEqual([]);
    expect(plainToInstance(CreateStaffNoteDto, { body: '  hi  ' }).body).toBe('hi');
  });

  it('accepts exactly 2000 characters and refuses 2001', async () => {
    expect(await errorsFor({ body: 'a'.repeat(2000) })).toEqual([]);
    expect(await errorsFor({ body: 'a'.repeat(2001) })).toHaveLength(1);
  });

  it('refuses empty, blank, missing and non-text bodies', async () => {
    expect(await errorsFor({ body: '' })).not.toEqual([]);
    expect(await errorsFor({ body: '   \n ' })).not.toEqual([]);
    expect(await errorsFor({})).not.toEqual([]);
    expect(await errorsFor({ body: 5 })).not.toEqual([]);
    expect(await errorsFor({ body: ['a'] })).not.toEqual([]);
  });

  it('refuses control characters other than newline and tab (null byte, escape, bare carriage return)', async () => {
    for (const bad of ['a\u0000b', 'a\u001bb', 'a\rb', 'a\u007fb', 'a\u000bb']) {
      expect(await errorsFor({ body: bad })).toContain('The note contains characters that are not allowed');
    }
  });

  it('keeps emoji and accented text', async () => {
    expect(await errorsFor({ body: 'Café Zoë 🐶 arrives with a dog' })).toEqual([]);
  });
});
