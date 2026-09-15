/**
 * @file apps/api/src/shared/validation/uuid-like.ts
 * @shared Accepts hyphenated 36-char ids (seed ids are not RFC UUID variants)
 */

export const UUID_LIKE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
