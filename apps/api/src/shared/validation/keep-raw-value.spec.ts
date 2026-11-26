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

// The app's global ValidationPipe no longer converts types (R2-16), so this mirrors it; KeepRawValue is the second line of defence.
async function passes(cls: new () => object, accepted: unknown, implicit = false): Promise<boolean> {
  return (await validate(plainToInstance(cls, { accepted }, { enableImplicitConversion: implicit }))).length === 0;
}

describe('KeepRawValue', () => {
  it('accepts a real boolean true', async () => {
    expect(await passes(Strict, true)).toBe(true);
  });

  it.each([false, 'true', 'false', 'yes', 'on', '', 1, 0, [], {}, null, undefined])('refuses %j', async (value) => {
    expect(await passes(Strict, value)).toBe(false);
  });

  it('a plain @IsBoolean refuses text because the app does not convert types any more', async () => {
    expect(await passes(Loose, 'yes')).toBe(false);
    expect(await passes(Loose, 'false')).toBe(false);
  });

  it('shows why the app switched conversion off: with it, "yes" and "false" count as true', async () => {
    expect(await passes(Loose, 'yes', true)).toBe(true);
    expect(await passes(Loose, 'false', true)).toBe(true);
    expect(await passes(Strict, 'false', true)).toBe(false);
  });
});
