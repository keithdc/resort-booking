/**
 * @file apps/api/src/shared/database/migration-status.ts
 * @shared Compares the migrations this build ships with the ones the database has applied
 * @dependencies none
 */

export interface MigrationStatus {
  /** Migration files in this build that the database has not applied yet. */
  pending: string[];
  /** Applied in the database but unknown to this build: the code is older than the schema. */
  unknown: string[];
}

/**
 * Pure comparison of shipped migration files against applied ids (both sorted in the result).
 */
export function compareMigrations(files: readonly string[], applied: readonly string[]): MigrationStatus {
  const shipped = new Set(files);
  const done = new Set(applied);
  return {
    pending: [...files].filter((name: string): boolean => !done.has(name)).sort(),
    unknown: [...applied].filter((name: string): boolean => !shipped.has(name)).sort(),
  };
}

/**
 * Operator-facing message for a build that is behind the database.
 */
export function describeStaleBuild(unknown: readonly string[]): string {
  return (
    `This API build is older than the database: it does not know migration(s) ${unknown.join(', ')}. ` +
    'Stop it, pull/rebuild the latest code (npm run start:dev) and start it again.'
  );
}
