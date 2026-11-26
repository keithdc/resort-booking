/**
 * @file apps/api/src/shared/http/rate-limited.exception.ts
 * @shared 429 that tells the client when to retry
 * @dependencies @nestjs/common
 */

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Too many requests. The exception filter turns `retryAfterSeconds` into the Retry-After header.
 */
export class RateLimitedException extends HttpException {
  public constructor(
    code: string,
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super({ message, code }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
