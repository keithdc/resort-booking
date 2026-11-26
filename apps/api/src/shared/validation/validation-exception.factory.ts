/**
 * @file apps/api/src/shared/validation/validation-exception.factory.ts
 * @shared The global validation pipe's options, with the password-specific 400 answer
 * @dependencies @nestjs/common, class-validator
 */

import { ValidationPipe, type ValidationPipeOptions } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ACCEPTABLE_PASSWORD_CONSTRAINT } from './is-acceptable-password';
import { validatePassword } from './password-policy';
import { PasswordTooWeakException } from './password-too-weak.exception';

type ExceptionFactory = (errors: ValidationError[]) => unknown;

const BASE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  // Instances of the DTO classes (so defaults and nested @Type work), but NO implicit type conversion: a wrong type
  // must fail validation, never turn into a valid value ("false" into true, {} into "[object Object]", [] into 0).
  // The few query-string numbers are converted explicitly with @QueryNumber().
  transform: true,
  transformOptions: { enableImplicitConversion: false },
};

/**
 * A weak password gets code PASSWORD_TOO_WEAK with the list of problems (recomputed from the rejected value;
 * the value itself is never put in the answer). Any other validation error goes to `fallback`, Nest's own
 * factory, so every other 400 keeps its usual shape.
 */
export function apiValidationException(errors: ValidationError[], fallback: ExceptionFactory): unknown {
  const weak = errors.find((error): boolean => error.constraints?.[ACCEPTABLE_PASSWORD_CONSTRAINT] !== undefined);
  if (weak !== undefined && typeof weak.value === 'string') {
    return new PasswordTooWeakException(validatePassword(weak.value).problems);
  }
  return fallback(errors);
}

/**
 * The options for the app's one global ValidationPipe (main.ts), shared with the tests so they see production.
 */
export function apiValidationPipeOptions(): ValidationPipeOptions {
  const fallback = new ValidationPipe(BASE_OPTIONS).createExceptionFactory();
  return {
    ...BASE_OPTIONS,
    exceptionFactory: (errors: ValidationError[]): unknown => apiValidationException(errors, fallback),
  };
}
