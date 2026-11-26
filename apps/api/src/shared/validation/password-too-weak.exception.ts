/**
 * @file apps/api/src/shared/validation/password-too-weak.exception.ts
 * @shared The 400 answer for a password that breaks the policy
 * @dependencies @nestjs/common
 */

import { BadRequestException } from '@nestjs/common';

export const PASSWORD_TOO_WEAK_CODE = 'PASSWORD_TOO_WEAK';

/**
 * 400 with code PASSWORD_TOO_WEAK and every problem in plain language (the error filter passes `problems` on).
 */
export class PasswordTooWeakException extends BadRequestException {
  public constructor(problems: readonly string[]) {
    super({
      message: `Password is too weak: ${problems.join('; ')}`,
      code: PASSWORD_TOO_WEAK_CODE,
      problems: [...problems],
    });
  }
}
