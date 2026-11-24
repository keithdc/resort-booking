/**
 * @file apps/api/src/shared/validation/keep-raw-value.ts
 * @shared Validation helper for fields where a loose conversion would be unsafe
 * @dependencies class-transformer
 */

import { Transform } from 'class-transformer';

/**
 * Keeps exactly the value that was sent, skipping the app's implicit type conversion.
 *
 * The global ValidationPipe converts values to the declared type before validating, so "yes" and
 * even "false" become `true` for a boolean field. Use this on fields where that would let a wrong
 * value count as a deliberate "yes" (a legal acceptance, a "confirm this change" flag). Combine it
 * with `@IsBoolean()` and `@Equals(true)` so only a real JSON `true` passes.
 */
export function KeepRawValue(): PropertyDecorator {
  return Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => obj[key]);
}
