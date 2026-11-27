/**
 * @file apps/api/src/modules/discounts/dto/discount-write.dto.spec.ts
 * @feature discounts
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DiscountWriteDto } from './discount-write.dto';

function body(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: 'Long stay',
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'min_nights', nights: 7 }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    ...extra,
  };
}

// The app's global ValidationPipe does not convert types (R2-16); plainToInstance without options mirrors it.
async function problems(extra: Record<string, unknown>): Promise<number> {
  return (await validate(plainToInstance(DiscountWriteDto, body(extra)))).length;
}

describe('DiscountWriteDto promoted', () => {
  it('is optional so an older admin keeps working', async () => {
    expect(await problems({})).toBe(0);
  });

  it.each([true, false])('accepts %s', async (promoted) => {
    expect(await problems({ promoted })).toBe(0);
  });

  it.each(['yes', 'true', 1, 0, 'on', []])('refuses %j instead of converting it into a yes', async (promoted) => {
    expect(await problems({ promoted })).toBeGreaterThan(0);
  });
});

describe('DiscountWriteDto oncePerGuest', () => {
  it('is optional so an older admin keeps working', async () => {
    expect(await problems({})).toBe(0);
  });

  it.each([true, false])('accepts %s', async (oncePerGuest) => {
    expect(await problems({ oncePerGuest })).toBe(0);
  });

  it.each(['yes', 'true', 1, 0, []])('refuses %j instead of converting it into a yes', async (oncePerGuest) => {
    expect(await problems({ oncePerGuest })).toBeGreaterThan(0);
  });
});

describe('DiscountWriteDto priority', () => {
  it('is optional: the admin no longer sends it', async () => {
    const withoutPriority = body();
    delete withoutPriority.priority;
    const dto = plainToInstance(DiscountWriteDto, withoutPriority);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('still checks the range when an older client sends one', async () => {
    expect(await problems({ priority: 1001 })).toBeGreaterThan(0);
    expect(await problems({ priority: -1 })).toBeGreaterThan(0);
    expect(await problems({ priority: 250 })).toBe(0);
  });
});
