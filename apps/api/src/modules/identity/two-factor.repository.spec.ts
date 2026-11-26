/**
 * @file apps/api/src/modules/identity/two-factor.repository.spec.ts
 * @feature identity
 * The rules that make replay and reuse impossible live in the SQL; these tests pin them.
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { TwoFactorRepository } from './two-factor.repository';

describe('TwoFactorRepository', () => {
  const query = jest.fn<Promise<{ rows: unknown[]; rowCount: number | null }>, [string, ...unknown[]]>();
  let repository: TwoFactorRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [TwoFactorRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(TwoFactorRepository);
  });

  const sql = (call = 0): string => query.mock.calls[call]?.[0] ?? '';
  const params = (call = 0): unknown[] => (query.mock.calls[call]?.slice(1)[0] ?? []) as unknown[];

  it('accepts a time step only when it is newer than the last one, in a single statement', async () => {
    await expect(repository.acceptStep('u1', 55)).resolves.toBe(true);

    expect(query).toHaveBeenCalledTimes(1);
    expect(sql()).toContain('last_used_step IS NULL OR last_used_step < $2');
    expect(sql()).toContain('enabled_at IS NOT NULL');
    expect(params()).toEqual(['u1', 55]);

    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(repository.acceptStep('u1', 55)).resolves.toBe(false);
  });

  it('consumes a recovery code only if it is still there, removing it in the same statement', async () => {
    await expect(repository.consumeRecoveryCode('u1', 'hash')).resolves.toBe(true);

    expect(sql()).toContain('array_remove(recovery_code_hashes, $2::text)');
    expect(sql()).toContain('$2::text = ANY(recovery_code_hashes)');
    expect(params()).toEqual(['u1', 'hash']);

    query.mockResolvedValue({ rows: [], rowCount: null });
    await expect(repository.consumeRecoveryCode('u1', 'hash')).resolves.toBe(false);
  });

  it('activates only an unconfirmed setup', async () => {
    await expect(repository.activate('u1', 9, ['h1', 'h2'])).resolves.toBe(true);

    expect(sql()).toContain('enabled_at IS NULL');
    expect(params()).toEqual(['u1', 9, ['h1', 'h2']]);
  });

  it('never overwrites a secret that is already confirmed', async () => {
    await repository.savePendingSecret('u1', 'v1:x:y:z');

    expect(sql()).toContain('WHERE staff_two_factor.enabled_at IS NULL');
  });

  it('reports whether anything was enabled, from a cheap EXISTS', async () => {
    query.mockResolvedValue({ rows: [{ enabled: true }], rowCount: 1 });
    await expect(repository.isEnabled('u1')).resolves.toBe(true);
    expect(sql()).toContain('enabled_at IS NOT NULL');

    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(repository.isEnabled('u1')).resolves.toBe(false);
  });

  it('reads the state, turning the bigint step into a number', async () => {
    query.mockResolvedValue({
      rows: [{ secret_encrypted: 'enc', enabled_at: new Date('2026-11-26T00:00:00Z'), last_used_step: '57000000', recovery_code_hashes: ['a'] }],
      rowCount: 1,
    });

    await expect(repository.findState('u1')).resolves.toEqual({
      secretEncrypted: 'enc',
      enabledAt: new Date('2026-11-26T00:00:00Z'),
      lastUsedStep: 57000000,
      recoveryCodeHashes: ['a'],
    });
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(repository.findState('u1')).resolves.toBeNull();
  });

  it('removes a member\'s two-factor only inside their organization, in one statement', async () => {
    query.mockResolvedValue({ rows: [{ had: true }], rowCount: 1 });

    await expect(repository.removeForMember('org-1', 'u1')).resolves.toEqual({ hadTwoFactor: true });

    expect(query).toHaveBeenCalledTimes(1);
    expect(sql()).toContain('organization_id = $2');
    expect(params()).toEqual(['u1', 'org-1']);

    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(repository.removeForMember('other-org', 'u1')).resolves.toBeNull();
  });

  it('finds a challenge only while unexpired and for an active person, by hash', async () => {
    query.mockResolvedValue({ rows: [{ id: 'c1', staff_user_id: 'u1', organization_id: 'o1', failed_attempts: 2 }], rowCount: 1 });

    await expect(repository.findChallenge('tokhash')).resolves.toEqual({ id: 'c1', staffUserId: 'u1', organizationId: 'o1', failedAttempts: 2 });

    expect(sql()).toContain('expires_at > now()');
    expect(sql()).toContain('u.active');
    expect(params()).toEqual(['tokhash']);
  });

  it('creates a challenge after clearing the person\'s old ones and any expired ones', async () => {
    const expiresAt = new Date('2026-11-26T12:05:00.000Z');

    await repository.createChallenge('u1', 'tokhash', expiresAt);

    expect(sql(0)).toContain('staff_user_id = $1 OR expires_at <= now()');
    expect(sql(1)).toContain('INSERT INTO staff_two_factor_challenges');
    expect(params(1)).toEqual(['u1', 'tokhash', '2026-11-26T12:05:00.000Z']);
  });

  it('counts a wrong code atomically and deletes a challenge once', async () => {
    query.mockResolvedValue({ rows: [{ failed_attempts: 3 }], rowCount: 1 });
    await expect(repository.recordChallengeFailure('c1')).resolves.toBe(3);
    expect(sql()).toContain('failed_attempts = failed_attempts + 1');

    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(repository.deleteChallenge('c1')).resolves.toBe(false);
  });

  it('removes a person\'s own two-factor together with their challenges', async () => {
    await expect(repository.remove('u1')).resolves.toBe(true);

    expect(sql(0)).toContain('staff_two_factor_challenges');
    expect(sql(1)).toContain('DELETE FROM staff_two_factor WHERE staff_user_id = $1');
  });
});
