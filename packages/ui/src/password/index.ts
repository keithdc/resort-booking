/**
 * @file packages/ui/src/password/index.ts
 * @shared Password rules (no React, no MUI): import from "@resort-booking/ui/password"
 * @dependencies none
 */

export {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordChecklist,
  validatePassword,
  type PasswordContext,
  type PasswordRuleId,
  type PasswordRuleResult,
  type PasswordValidation,
} from './password-policy';
