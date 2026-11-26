/**
 * @file apps/api/src/shared/validation/query-number.ts
 * @shared Explicit text-to-number conversion for query-string fields (the only place the API converts types)
 * @dependencies class-transformer
 */

import { Transform } from 'class-transformer';

const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * A query string can only carry text, so a number field there must be converted on purpose. Only text that is a plain
 * decimal number ("2", "-1.5") becomes a number; anything else (empty, "abc", "1e3", "0x10", a repeated parameter) is
 * left as sent so `@IsInt()` / `@IsNumber()` reject it. Never use it on a JSON body: there a number must already be one.
 */
export function QueryNumber(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' && PLAIN_NUMBER.test(value) ? Number(value) : value,
  );
}
