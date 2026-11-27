import { toSafeNumber } from './checked-number';

describe('toSafeNumber', () => {
  it('reads bigint strings, numbers and null', () => {
    expect(toSafeNumber('0', 'x')).toBe(0);
    expect(toSafeNumber('96000', 'x')).toBe(96000);
    expect(toSafeNumber(1500, 'x')).toBe(1500);
    expect(toSafeNumber(null, 'x')).toBe(0);
    expect(toSafeNumber(undefined, 'x')).toBe(0);
    expect(toSafeNumber(12n, 'x')).toBe(12);
  });

  it('keeps totals above the old 32-bit limit exact', () => {
    expect(toSafeNumber('2147483648', 'x')).toBe(2_147_483_648);
    expect(toSafeNumber('9007199254740991', 'x')).toBe(Number.MAX_SAFE_INTEGER);
    expect(toSafeNumber('-9007199254740991', 'x')).toBe(Number.MIN_SAFE_INTEGER);
  });

  it('refuses a value a number cannot hold exactly instead of showing a wrong total', () => {
    expect(() => toSafeNumber('9007199254740993', 'Paid total')).toThrow('Paid total is too large to show exactly');
    expect(() => toSafeNumber(9_007_199_254_740_993, 'x')).toThrow();
  });

  it('refuses text that is not a whole number', () => {
    expect(() => toSafeNumber('12.5', 'x')).toThrow('x is not a whole number');
    expect(() => toSafeNumber('abc', 'x')).toThrow();
  });
});
