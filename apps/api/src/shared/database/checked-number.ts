/**
 * @file apps/api/src/shared/database/checked-number.ts
 * @shared Reading 64-bit database numbers without losing digits
 *
 * Postgres sums of integer money columns are `bigint`, and the pg driver returns a bigint as a STRING. Report totals are
 * therefore summed as 64-bit in SQL (a period total can pass the 32-bit limit of about 21 million euros) and read here:
 * the value becomes a JavaScript number only when it is a whole number that a number holds exactly; anything else
 * throws, so a wrong total is never shown quietly.
 */

/** A bigint (string) or number from the database as a safe whole number. Null and undefined count as 0. */
export function toSafeNumber(value: string | number | bigint | null | undefined, what: string): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === 'bigint' ? value : typeof value === 'number' ? BigInt(Number.isSafeInteger(value) ? value : Number.NaN) : parseBigInt(value, what);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${what} is too large to show exactly`);
  }
  return Number(parsed);
}

function parseBigInt(text: string, what: string): bigint {
  if (!/^-?\d+$/.test(text.trim())) {
    throw new TypeError(`${what} is not a whole number`);
  }
  return BigInt(text.trim());
}
