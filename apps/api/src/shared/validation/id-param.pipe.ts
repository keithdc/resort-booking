/**
 * @file apps/api/src/shared/validation/id-param.pipe.ts
 * @shared App-wide: a malformed id in a URL is a clean 400, not a database error
 * @dependencies uuid-like
 */

import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { UUID_LIKE } from './uuid-like';

/** Route parameters that hold an id: `id`, or a name ending in `Id` (houseId, propertyId, holdId...). */
const ID_PARAM_NAME = /^(id|[a-z][A-Za-z]*Id)$/;

/**
 * Registered once as a global pipe. Every route parameter named `id` or `*Id` must look like an id (the
 * seeded ids are not strict RFC variants, so the framework's own UUID pipe would refuse real data). Slugs and
 * other parameters pass untouched, as do query and body values.
 */
@Injectable()
export class IdParamPipe implements PipeTransform<unknown, unknown> {
  public transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'param' || metadata.data === undefined || !ID_PARAM_NAME.test(metadata.data)) {
      return value;
    }
    if (typeof value !== 'string' || !UUID_LIKE.test(value)) {
      throw new BadRequestException({ message: 'That id is not valid', code: 'INVALID_ID' });
    }
    return value;
  }
}
