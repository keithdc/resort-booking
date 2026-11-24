/**
 * @file apps/api/src/shared/validation/parse-uuid-like.pipe.spec.ts
 * @shared ParseUuidLikePipe
 */

import { BadRequestException } from '@nestjs/common';
import { ParseUuidLikePipe } from './parse-uuid-like.pipe';

describe('ParseUuidLikePipe', () => {
  const pipe = new ParseUuidLikePipe();

  it.each(['33333333-3333-3333-3333-333333333331', '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d', '1A2B3C4D-5E6F-4A8B-9C0D-1E2F3A4B5C6D'])(
    'lets the id %s through unchanged',
    (id) => {
      expect(pipe.transform(id)).toBe(id);
    },
  );

  it.each(['', 'nope', '123', '1a2b3c4d5e6f4a8b9c0d1e2f3a4b5c6d', "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d'; DROP TABLE x;--", '../etc/passwd'])(
    'refuses %j with a clear 400 and code',
    (id) => {
      expect(() => pipe.transform(id)).toThrow(BadRequestException);
      try {
        pipe.transform(id);
      } catch (error: unknown) {
        expect(error).toMatchObject({ response: { code: 'INVALID_ID' } });
      }
    },
  );
});
