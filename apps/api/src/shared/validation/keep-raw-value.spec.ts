/**
 * @file apps/api/src/shared/validation/keep-raw-value.spec.ts
 * @shared KeepRawValue
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { Equals, IsBoolean, validate } from 'class-validator';
import { KeepRawValue } from './keep-raw-value';

class Strict {
  @KeepRawValue()
  @IsBoolean()
  @Equals(true)
  public accepted!: boolean;
}

class Loose {
  @IsBoolean()
  @Equals(true)
  public accepted!: boolean;
}

// The app's global ValidationPipe uses implicit conversion (main.ts); mirror it.
async function passes(cls: new () => object, accepted: unknown): Promise<boolean> {
  return (await validate(plainToInstance(cls, { accepted }, { enableImplicitConversion: true }))).length === 0;
}

describe('KeepRawValue', () => {
  it('accepts a real boolean true', async () => {
    expect(await passes(Strict, true)).toBe(true);
  });

  it.each([false, 'true', 'false', 'yes', 'on', '', 1, 0, [], {}, null, undefined])('refuses %j', async (value) => {
    expect(await passes(Strict, value)).toBe(false);
  });

  it('shows why it is needed: without it the app\'s conversion lets "yes" and "false" through as true', async () => {
    expect(await passes(Loose, 'yes')).toBe(true);
    expect(await passes(Loose, 'false')).toBe(true);
  });
});
