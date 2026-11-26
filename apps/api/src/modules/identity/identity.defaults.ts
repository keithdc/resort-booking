/**
 * @file apps/api/src/modules/identity/identity.defaults.ts
 * @feature identity
 * @dependencies none
 */

/**
 * The development owner login documented in the README. It exists so a fresh checkout can sign in; the
 * API refuses to start in production while an account with these exact credentials is still active.
 */
export const DEV_OWNER_EMAIL = 'owner@atlantic.example';
export const DEV_OWNER_PASSWORD = 'AtlanticOwner1!';
