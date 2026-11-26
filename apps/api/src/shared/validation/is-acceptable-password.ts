/**
 * @file apps/api/src/shared/validation/is-acceptable-password.ts
 * @shared class-validator rule: a new password must meet the password policy
 * @dependencies class-validator
 */

import { registerDecorator, type ValidationOptions } from 'class-validator';
import { validatePassword } from './password-policy';

/** The constraint name the validation pipe's error factory looks for. */
export const ACCEPTABLE_PASSWORD_CONSTRAINT = 'isAcceptablePassword';

/**
 * Put on a field that SETS a password (never on a login field: existing accounts keep their old passwords).
 * Email-independent rules only; the service adds the "not made from your email" rule where it knows the email.
 */
export function IsAcceptablePassword(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: ACCEPTABLE_PASSWORD_CONSTRAINT,
      target: target.constructor,
      propertyName: String(propertyName),
      ...(options === undefined ? {} : { options }),
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && validatePassword(value).ok,
        defaultMessage: (): string => 'Password is too weak',
      },
    });
  };
}
