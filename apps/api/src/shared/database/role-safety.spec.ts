/**
 * @file apps/api/src/shared/database/role-safety.spec.ts
 * @shared Judging the role the API runs as
 */

import { assessRuntimeRole, roleFactsFromRow, RUNTIME_ROLE_QUERY, type RuntimeRoleFacts } from './role-safety';

const SAFE: RuntimeRoleFacts = { roleName: 'resort_app', isSuperuser: false, canCreateDatabases: false, canCreateRoles: false, ownedTableCount: 0 };

describe('assessRuntimeRole', () => {
  it('accepts a plain least-privilege role in production', () => {
    expect(assessRuntimeRole(SAFE, true)).toEqual({ errors: [], warnings: [] });
  });

  it('refuses a superuser in production, naming the role and the fix', () => {
    const { errors, warnings } = assessRuntimeRole({ ...SAFE, roleName: 'resort', isSuperuser: true }, true);

    expect(warnings).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"resort"');
    expect(errors[0]).toContain('superuser');
    expect(errors[0]).toContain('db:setup-roles');
  });

  it('refuses a role that can create roles, create databases or own tables, each as its own finding', () => {
    const { errors } = assessRuntimeRole({ ...SAFE, canCreateRoles: true, canCreateDatabases: true, ownedTableCount: 21 }, true);

    expect(errors).toHaveLength(3);
    expect(errors.join(' ')).toContain('create other roles');
    expect(errors.join(' ')).toContain('create databases');
    expect(errors.join(' ')).toContain('owns 21 table(s)');
  });

  it('reports the same findings as warnings in development, so the developer keeps working', () => {
    const { errors, warnings } = assessRuntimeRole({ ...SAFE, roleName: 'resort', isSuperuser: true, ownedTableCount: 21 }, false);

    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(2);
  });

  it('turns a database row into facts', () => {
    expect(
      roleFactsFromRow({ role_name: 'resort', is_superuser: true, can_create_databases: false, can_create_roles: true, owned_table_count: 3 }),
    ).toEqual({ roleName: 'resort', isSuperuser: true, canCreateDatabases: false, canCreateRoles: true, ownedTableCount: 3 });
  });

  it('asks Postgres about the current user only', () => {
    expect(RUNTIME_ROLE_QUERY).toContain('current_user');
    expect(RUNTIME_ROLE_QUERY).toContain('rolsuper');
    expect(RUNTIME_ROLE_QUERY).toContain('rolcreaterole');
    expect(RUNTIME_ROLE_QUERY).toContain('rolcreatedb');
  });
});
