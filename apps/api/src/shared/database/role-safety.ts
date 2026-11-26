/**
 * @file apps/api/src/shared/database/role-safety.ts
 * @shared Is the role the API runs as safe? (no superuser, cannot create roles or databases, owns no tables)
 * @dependencies none
 */

/** What Postgres says about the role the API is connected as. */
export interface RuntimeRoleFacts {
  roleName: string;
  isSuperuser: boolean;
  canCreateDatabases: boolean;
  canCreateRoles: boolean;
  /** Tables in the public schema owned by this role: the owner can drop or alter them. */
  ownedTableCount: number;
}

export interface RoleAssessment {
  /** Production refuses to start with any of these. */
  errors: string[];
  /** Development logs these and carries on. */
  warnings: string[];
}

/** One statement, no parameters: the facts the check needs. */
export const RUNTIME_ROLE_QUERY = `
  SELECT
    r.rolname AS role_name,
    r.rolsuper AS is_superuser,
    r.rolcreatedb AS can_create_databases,
    r.rolcreaterole AS can_create_roles,
    (SELECT count(*)::int FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = r.rolname) AS owned_table_count
  FROM pg_roles r
  WHERE r.rolname = current_user
`;

/** Row as returned by `RUNTIME_ROLE_QUERY`. */
export interface RuntimeRoleRow {
  role_name: string;
  is_superuser: boolean;
  can_create_databases: boolean;
  can_create_roles: boolean;
  owned_table_count: number;
}

/**
 * Turns the query row into facts.
 */
export function roleFactsFromRow(row: RuntimeRoleRow): RuntimeRoleFacts {
  return {
    roleName: row.role_name,
    isSuperuser: row.is_superuser,
    canCreateDatabases: row.can_create_databases,
    canCreateRoles: row.can_create_roles,
    ownedTableCount: row.owned_table_count,
  };
}

const FIX = 'Fix: run `npm run db:setup-roles` and point DATABASE_URL at the resort_app role (docs/11-database-access.md).';

/**
 * Judges the runtime role. The findings are the same in every environment; production treats them as errors and
 * development as warnings. A message never contains a password or a URL.
 */
export function assessRuntimeRole(facts: RuntimeRoleFacts, production: boolean): RoleAssessment {
  const findings: string[] = [];
  const name = `"${facts.roleName}"`;
  if (facts.isSuperuser) {
    findings.push(
      `The API connects to Postgres as ${name}, a superuser: a single SQL injection would be full control of the server. ${FIX}`,
    );
  }
  if (facts.canCreateRoles) {
    findings.push(`The database role ${name} can create other roles. ${FIX}`);
  }
  if (facts.canCreateDatabases) {
    findings.push(`The database role ${name} can create databases. ${FIX}`);
  }
  if (facts.ownedTableCount > 0) {
    findings.push(
      `The database role ${name} owns ${String(facts.ownedTableCount)} table(s), so it can drop or alter them. The runtime role must only read and write rows. ${FIX}`,
    );
  }
  return production ? { errors: findings, warnings: [] } : { errors: [], warnings: findings };
}
