/**
 * @file apps/api/src/migrations/coupon-once-per-guest.integration.spec.ts
 * @shared Opt-in: proves migration 046 (a coupon limited to one use per guest, by email) against a real Postgres
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated (001 to the newest),
 * given the three roles, and dropped afterwards.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest coupon-once-per-guest.integration
 */

import { randomBytes } from 'node:crypto';
import { Client, Pool, type PoolClient } from 'pg';
import { DiscountsRepository } from '../modules/discounts/discounts.repository';
import { DiscountsService } from '../modules/discounts/discounts.service';
import { GuestEmailKeyService, guestEmailKey } from '../modules/discounts/guest-email-key';
import { urlWithCredentials } from '../shared/database/database-urls';
import { applyPendingMigrations, poolExecutor } from '../shared/database/migration-files';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from '../shared/database/roles';
import { anonymiseBookingsSql, ANONYMISED_NAME, REMOVED_TEXT } from '../shared/privacy/anonymise-sql';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `cog_owner_${SUFFIX}`, DB_APP_ROLE: `cog_app_${SUFFIX}`, DB_READONLY_ROLE: `cog_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };
const SALT = `integration-salt-${SUFFIX}-0123456789abcdef`;

const ORG = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const HOUSE = '33333333-3333-3333-3333-333333333331';

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('a coupon limited to once per guest (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let admin: Pool;
  let app: Pool;
  let options: RoleSetupOptions;
  let service: DiscountsService;
  let repository: DiscountsRepository;
  let night = 0;

  async function booking(email: string | null = 'ada@example.com'): Promise<string> {
    night += 3;
    const start = new Date(Date.UTC(2097, 0, 1) + night * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(2097, 0, 1) + (night + 2) * 86_400_000).toISOString().slice(0, 10);
    const result = await app.query<{ id: string }>(
      `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count, payment_method, payment_status,
         booker_name, booker_email, total_cents, paid_cents, currency_code)
       VALUES ($1, $2, $3, 'reservation', 'confirmed', $4::date, $5::date, 2, 'pay_at_hotel', 'pending', 'Ada Guest', $6, 96000, 0, 'EUR') RETURNING id`,
      [ORG, PROPERTY, HOUSE, start, end, email],
    );
    return result.rows[0]?.id ?? '';
  }

  async function coupon(oncePerGuest: boolean, code = `CODE${randomBytes(3).toString('hex')}`): Promise<string> {
    const result = await app.query<{ id: string }>(
      `INSERT INTO discounts (organization_id, property_id, label, effect_kind, effect_value, conditions, combinable, once_per_guest)
       VALUES ($1, $2, $3, 'percent', 15, $4::jsonb, true, $5) RETURNING id`,
      [ORG, PROPERTY, `Coupon ${code}`, JSON.stringify([{ kind: 'promo_code', code }]), oncePerGuest],
    );
    return result.rows[0]?.id ?? '';
  }

  const failure = async (pool: Pool, sql: string, params: unknown[] = []): Promise<string> => {
    try {
      await pool.query(sql, params);
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error);
    }
    return '';
  };

  async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const line = (discountId: string): { discountId: string; label: string; amountCents: number } => ({ discountId, label: 'Coupon', amountCents: 1000 });

  beforeAll(async () => {
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`CREATE DATABASE ${DATABASE}`);
    await maintenance.end();
    admin = new Pool({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), DATABASE), max: 2 });
    options = roleOptionsFromEnv({ ...PASSWORDS, ...NAMES }, DATABASE);
    await applyPendingMigrations(poolExecutor(admin), { appRole: options.appRole });
    for (const statement of buildRoleStatements(options)) {
      await admin.query(statement.sql);
    }
    app = new Pool({ connectionString: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE), max: 4 });
    repository = new DiscountsRepository({ query: (sql: string, params?: unknown[]) => app.query(sql, params) } as never);
    service = new DiscountsService(repository, {} as never, new GuestEmailKeyService({ get: (): string => SALT } as never));
  });

  afterAll(async () => {
    await app.end();
    await admin.end();
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of Object.values(NAMES)) {
      await maintenance.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await maintenance.end();
  });

  it('leaves every existing discount unlimited (the column defaults to off)', async () => {
    const rows = await app.query<{ once_per_guest: boolean }>('SELECT once_per_guest FROM discounts');
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.every((row) => row.once_per_guest === false)).toBe(true);
  });

  it('lets only a coupon carry the switch', async () => {
    expect(await failure(app, `INSERT INTO discounts (organization_id, property_id, label, effect_kind, effect_value, conditions, once_per_guest)
      VALUES ($1, $2, 'Long stay', 'percent', 10, '[{"kind":"min_nights","nights":7}]'::jsonb, true)`, [ORG, PROPERTY])).toContain('discounts_once_per_guest_coupon_check');
    expect(await failure(app, `INSERT INTO discounts (organization_id, property_id, label, effect_kind, effect_value, always_on, once_per_guest)
      VALUES ($1, $2, 'Always', 'percent', 10, true, true)`, [ORG, PROPERTY])).toContain('discounts_once_per_guest_coupon_check');
    expect(await coupon(true)).not.toBe('');
  });

  it('keeps only a well-formed key, never an address', async () => {
    const discountId = await coupon(true);
    const id = await booking();
    expect(await failure(app, `INSERT INTO discount_redemptions (discount_id, inventory_block_id, amount_cents, email_key) VALUES ($1, $2, 100, 'ada@example.com')`, [discountId, id])).toContain('discount_redemptions_email_key_check');
    expect(await failure(app, `INSERT INTO discount_redemptions (discount_id, inventory_block_id, amount_cents, email_key) VALUES ($1, $2, 100, $3)`, [discountId, id, guestEmailKey('ada@example.com', SALT)])).toBe('');
  });

  it('refuses a second use of the same key by the unique index, even when the application check is skipped', async () => {
    const discountId = await coupon(true);
    const key = guestEmailKey('grace@example.com', SALT);
    const first = await booking('grace@example.com');
    const second = await booking('grace@example.com');
    await inTransaction((client) => repository.recordRedemptions(client, first, [{ discountId, amountCents: 100, emailKey: key }]));

    const message = await failure(app, `INSERT INTO discount_redemptions (discount_id, inventory_block_id, amount_cents, email_key) VALUES ($1, $2, 100, $3)`, [discountId, second, key]);
    expect(message).toContain('discount_redemptions_one_use_per_email_key');
  });

  it('lets a coupon without the switch be used by one email as often as it likes, and different emails use a limited one', async () => {
    const free = await coupon(false);
    const limited = await coupon(true);
    const a = await booking('a@example.com');
    const b = await booking('a@example.com');
    const c = await booking('c@example.com');
    const d = await booking('d@example.com');
    await inTransaction((client) => service.recordRedemptions(client, a, [line(free)]));
    await inTransaction((client) => service.recordRedemptions(client, b, [line(free)]));
    await inTransaction((client) => service.recordRedemptions(client, c, [line(limited)]));
    await inTransaction((client) => service.recordRedemptions(client, d, [line(limited)]));
    const counts = await app.query<{ discount_id: string; n: number }>('SELECT discount_id, count(*)::int AS n FROM discount_redemptions WHERE discount_id = ANY($1) GROUP BY discount_id', [[free, limited]]);
    expect(Object.fromEntries(counts.rows.map((row) => [row.discount_id, row.n]))).toEqual({ [free]: 2, [limited]: 2 });
  });

  it('refuses the same guest with PROMO_ALREADY_USED, whatever the spelling of the address, and rolls the booking back', async () => {
    const discountId = await coupon(true);
    const first = await booking('Grace.Hopper+deal@gmail.com');
    const second = await booking('gracehopper@googlemail.com');
    await inTransaction((client) => service.recordRedemptions(client, first, [line(discountId)]));

    await expect(service.assertGuestMayUse([line(discountId)], 'GRACEHOPPER@gmail.com')).rejects.toMatchObject({ status: 409, response: { code: 'PROMO_ALREADY_USED' } });
    await expect(inTransaction((client) => service.recordRedemptions(client, second, [line(discountId)]))).rejects.toMatchObject({ response: { code: 'PROMO_ALREADY_USED' } });
    const used = await app.query('SELECT 1 FROM discount_redemptions WHERE inventory_block_id = $1', [second]);
    expect(used.rowCount).toBe(0);
    // Another address is another guest.
    await expect(service.assertGuestMayUse([line(discountId)], 'someone.else@example.com')).resolves.toBeUndefined();
  });

  it('maps two checkouts racing with the same address to the same error: only one is recorded', async () => {
    const discountId = await coupon(true);
    const first = await booking('race@example.com');
    const second = await booking('race@example.com');
    const outcomes = await Promise.allSettled([
      inTransaction((client) => service.recordRedemptions(client, first, [line(discountId)])),
      inTransaction((client) => service.recordRedemptions(client, second, [line(discountId)])),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const refused = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult | undefined;
    expect(refused?.reason).toMatchObject({ response: { code: 'PROMO_ALREADY_USED' } });
    const count = await app.query<{ n: number }>('SELECT count(*)::int AS n FROM discount_redemptions WHERE discount_id = $1', [discountId]);
    expect(count.rows[0]?.n).toBe(1);
  });

  it('moves a guest\'s own use to the booking that replaces it (a date change) without counting it twice', async () => {
    const discountId = await coupon(true);
    const old = await booking('move@example.com');
    const replacement = await booking('move@example.com');
    await inTransaction((client) => service.recordRedemptions(client, old, [line(discountId)]));

    await inTransaction((client) => service.moveRedemptions(client, old, replacement, [line(discountId)]));

    const rows = await app.query<{ inventory_block_id: string; email_key: string | null }>('SELECT inventory_block_id, email_key FROM discount_redemptions WHERE discount_id = $1', [discountId]);
    expect(rows.rows).toEqual([{ inventory_block_id: replacement, email_key: guestEmailKey('move@example.com', SALT) }]);
    await expect(service.assertGuestMayUse([line(discountId)], 'move@example.com', replacement)).resolves.toBeUndefined();
  });

  it('keeps counting a cancelled booking\'s use, exactly like the use limit does today', async () => {
    const discountId = await coupon(true);
    const id = await booking('cancel@example.com');
    await inTransaction((client) => service.recordRedemptions(client, id, [line(discountId)]));
    await app.query(`UPDATE inventory_blocks SET status = 'released' WHERE id = $1`, [id]).catch(() => undefined);

    await expect(service.assertGuestMayUse([line(discountId)], 'cancel@example.com')).rejects.toMatchObject({ response: { code: 'PROMO_ALREADY_USED' } });
  });

  it('records no key for a booking that has no email (anonymised), so the limit cannot apply to it', async () => {
    const discountId = await coupon(true);
    const id = await booking(null);
    await inTransaction((client) => service.recordRedemptions(client, id, [line(discountId)]));
    const row = await app.query<{ email_key: string | null }>('SELECT email_key FROM discount_redemptions WHERE inventory_block_id = $1', [id]);
    expect(row.rows[0]?.email_key).toBeNull();
  });

  it('clears the key when the booking is anonymised, and then the address can use the code again', async () => {
    const discountId = await coupon(true);
    const id = await booking('forget@example.com');
    await inTransaction((client) => service.recordRedemptions(client, id, [line(discountId)]));
    await expect(service.assertGuestMayUse([line(discountId)], 'forget@example.com')).rejects.toMatchObject({ response: { code: 'PROMO_ALREADY_USED' } });

    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL resort.record_maintenance = 'on'`);
      const result = await client.query<{ n: number; email_keys: number }>(
        anonymiseBookingsSql('SELECT ib.id FROM inventory_blocks ib WHERE ib.id = ANY($3::uuid[]) AND ib.anonymised_at IS NULL'),
        [ANONYMISED_NAME, REMOVED_TEXT, [id]],
      );
      await client.query('COMMIT');
      expect(result.rows[0]).toMatchObject({ n: 1, email_keys: 1 });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const row = await app.query<{ email_key: string | null }>('SELECT email_key FROM discount_redemptions WHERE inventory_block_id = $1', [id]);
    expect(row.rows[0]?.email_key).toBeNull();
    await expect(service.assertGuestMayUse([line(discountId)], 'forget@example.com')).resolves.toBeUndefined();
  });
});
