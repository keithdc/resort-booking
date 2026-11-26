/**
 * @file packages/shared-types/src/two-factor.ts
 * @shared Optional two-factor authentication (TOTP) contracts for staff (admin app and api)
 * @dependencies none
 */

/** GET /staff/me/two-factor */
export interface TwoFactorStatus {
  enabled: boolean;
  /** ISO time two-factor was switched on, null while it is off. */
  enabledAt: string | null;
  /** A secret was issued but never confirmed. */
  setupPending: boolean;
  recoveryCodesRemaining: number;
}

/** POST /staff/me/two-factor/setup: shown to the person once; nothing is protected until they confirm a code. */
export interface TwoFactorSetup {
  /** Base32, for typing into an authenticator app. */
  secret: string;
  /** otpauth:// URI (there is no QR image; apps and password managers read this text). */
  otpauthUri: string;
  issuer: string;
  accountName: string;
}

/** POST /staff/me/two-factor/enable */
export interface TwoFactorEnableRequest {
  code: string;
}

/** Answer of enable and of regenerate: the ten recovery codes, returned this once only. */
export interface TwoFactorRecoveryCodes {
  recoveryCodes: string[];
}

/** POST /staff/me/two-factor/disable and /recovery-codes/regenerate: proof of both factors. */
export interface TwoFactorConfirmRequest {
  currentPassword: string;
  /** A current authenticator code or an unused recovery code. */
  code: string;
}

/**
 * What POST /staff/login answers INSTEAD of a session when the account has two-factor on. It is NOT a session:
 * the challenge token works only on /staff/login/two-factor, for five minutes.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  expiresAt: string;
}

/** POST /staff/login/two-factor */
export interface TwoFactorLoginRequest {
  challengeToken: string;
  /** An authenticator code or a recovery code. */
  code: string;
}

/** POST /staff/team/:staffId/reset-two-factor */
export interface TwoFactorResetResult {
  /** False when the person had nothing to reset. */
  hadTwoFactor: boolean;
}
