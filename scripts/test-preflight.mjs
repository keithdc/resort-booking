// Checks what the real-database tests need, and says so in plain words before they run.
// Used by `npm run test:full` and `npm run test:db`. It changes nothing.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.env.DATABASE_ADMIN_URL ?? 'postgres://resort:resort@localhost:5433/postgres';
const shown = url.replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@');
const problems = [];

const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 });
try {
  await client.connect();
  const who = await client.query('select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user');
  const role = who.rows[0];
  if (role === undefined || (!role.rolsuper && !(role.rolcreatedb && role.rolcreaterole))) {
    problems.push(
      'The database user in DATABASE_ADMIN_URL cannot create databases and roles. The database tests make temporary ones (resort_check_*). Use a superuser URL, for example the local Docker one: postgres://resort:resort@localhost:5433/postgres.',
    );
  }
} catch (error) {
  problems.push(
    `Cannot reach the database at ${shown} (${error instanceof Error ? error.message : String(error)}). Start it with "npm run db:up", or set DATABASE_ADMIN_URL to a superuser URL of a running Postgres.`,
  );
} finally {
  await client.end().catch(() => undefined);
}

if (problems.length > 0) {
  console.error('\nThe database tests cannot run yet:\n');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error('\nNothing was run. Fix the above and run the command again.\n');
  process.exit(1);
}
console.log(`Database tests: connected to ${shown}.`);
