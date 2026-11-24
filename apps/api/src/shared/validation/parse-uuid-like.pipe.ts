/**
 * @file apps/api/src/shared/validation/parse-uuid-like.pipe.ts
 * @shared Rejects a malformed id in a URL before it reaches the database
 * @dependencies uuid-like
 */

import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { UUID_LIKE } from './uuid-like';

/**
 * Accepts a hyphenated 36-character id (the seeded ids are not strict RFC variants, so the framework's
 * own UUID pipe would refuse real data). Anything else is a clear 400 instead of a database error.
 */
@Injectable()
export class ParseUuidLikePipe implements PipeTransform<string, string> {
  public transform(value: string): string {
    if (!UUID_LIKE.test(value)) {
      throw new BadRequestException({ message: 'That id is not valid', code: 'INVALID_ID' });
    }
    return value;
  }
}
