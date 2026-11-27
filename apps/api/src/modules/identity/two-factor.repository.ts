/**
 * @file apps/api/src/modules/identity/two-factor.repository.ts
 * @feature identity
 * @dependencies DatabaseService
 * SQL for staff_two_factor and staff_two_factor_challenges. Every state change is ONE atomic statement whose
 * WHERE clause carries the rule (not yet enabled, newer step, code still unused), so two requests racing each
 * other cannot both win.
 */

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';

interface TwoFactorRow {
  secret_encrypted: string;
  enabled_at: Date | null;
  last_used_step: string | null;
  recovery_code_hashes: string[];
}

interface ChallengeRow {
  id: string;
  staff_user_id: string;
  organization_id: string;
  failed_attempts: number;
}

/** One person's stored two-factor state. */
export interface TwoFactorState {
  secretEncrypted: string;
  enabledAt: Date | null;
  lastUsedStep: number | null;
  recoveryCodeHashes: string[];
}

/** A live (unexpired, person still active) login challenge. */
export interface ChallengeRecord {
  id: string;
  staffUserId: string;
  organizationId: string;
  failedAttempts: number;
}

@Injectable()
export class TwoFactorRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findState(staffUserId: string): Promise<TwoFactorState | null> {
    const result = await this.database.query<TwoFactorRow>(
      'SELECT secret_encrypted, enabled_at, last_used_step, recovery_code_hashes FROM staff_two_factor WHERE staff_user_id = $1',
      [staffUserId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          secretEncrypted: row.secret_encrypted,
          enabledAt: row.enabled_at,
          lastUsedStep: row.last_used_step === null ? null : Number(row.last_used_step),
          recoveryCodeHashes: row.recovery_code_hashes,
        };
  }

  /** True when two-factor is switched on (a pending setup does not count). */
  public async isEnabled(staffUserId: string): Promise<boolean> {
    const result = await this.database.query<{ enabled: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM staff_two_factor WHERE staff_user_id = $1 AND enabled_at IS NOT NULL) AS enabled',
      [staffUserId],
    );
    return result.rows[0]?.enabled === true;
  }

  /** Stores a new unconfirmed secret (replacing an earlier unconfirmed one). False when already enabled. */
  public async savePendingSecret(staffUserId: string, secretEncrypted: string): Promise<boolean> {
    const result = await this.database.query(
      `
      INSERT INTO staff_two_factor (staff_user_id, secret_encrypted)
      VALUES ($1, $2)
      ON CONFLICT (staff_user_id) DO UPDATE
        SET secret_encrypted = EXCLUDED.secret_encrypted, last_used_step = NULL, updated_at = now()
        WHERE staff_two_factor.enabled_at IS NULL
      `,
      [staffUserId, secretEncrypted],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Swaps the stored ciphertext of a secret for a re-encrypted copy (key rotation). Only when the row still holds the
   * ciphertext that was read (`expected`), so a concurrent setup is never overwritten. The secret itself does not change.
   */
  public async replaceSecret(staffUserId: string, secretEncrypted: string, expected: string): Promise<boolean> {
    const result = await this.database.query(
      'UPDATE staff_two_factor SET secret_encrypted = $2 WHERE staff_user_id = $1 AND secret_encrypted = $3',
      [staffUserId, secretEncrypted, expected],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Switches two-factor on once, storing the accepted step and the recovery code hashes. False if already on. */
  public async activate(staffUserId: string, step: number, recoveryCodeHashes: string[]): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE staff_two_factor
      SET enabled_at = now(), last_used_step = $2, recovery_code_hashes = $3::text[], updated_at = now()
      WHERE staff_user_id = $1 AND enabled_at IS NULL
      `,
      [staffUserId, step, recoveryCodeHashes],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Records a TOTP step as used. False when that step (or a newer one) was already accepted: a replay. */
  public async acceptStep(staffUserId: string, step: number): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE staff_two_factor SET last_used_step = $2, updated_at = now()
      WHERE staff_user_id = $1 AND enabled_at IS NOT NULL AND (last_used_step IS NULL OR last_used_step < $2)
      `,
      [staffUserId, step],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Removes one recovery code by its hash. False when it is not (or no longer) there: single use. */
  public async consumeRecoveryCode(staffUserId: string, codeHash: string): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE staff_two_factor
      SET recovery_code_hashes = array_remove(recovery_code_hashes, $2::text), updated_at = now()
      WHERE staff_user_id = $1 AND enabled_at IS NOT NULL AND $2::text = ANY(recovery_code_hashes)
      `,
      [staffUserId, codeHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async replaceRecoveryCodes(staffUserId: string, recoveryCodeHashes: string[]): Promise<boolean> {
    const result = await this.database.query(
      `
      UPDATE staff_two_factor SET recovery_code_hashes = $2::text[], updated_at = now()
      WHERE staff_user_id = $1 AND enabled_at IS NOT NULL
      `,
      [staffUserId, recoveryCodeHashes],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Removes the person's two-factor and any open challenge. True when there was something to remove. */
  public async remove(staffUserId: string): Promise<boolean> {
    await this.database.query('DELETE FROM staff_two_factor_challenges WHERE staff_user_id = $1', [staffUserId]);
    const result = await this.database.query('DELETE FROM staff_two_factor WHERE staff_user_id = $1', [staffUserId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Admin reset: removes the two-factor of one member OF THIS ORGANIZATION (the organization is part of the
   * statement, so another workspace's member can never be touched). Null when the member is not in it.
   */
  public async removeForMember(
    organizationId: string,
    staffUserId: string,
    audit?: (client: PoolClient, outcome: { hadTwoFactor: boolean }) => Promise<void>,
  ): Promise<{ hadTwoFactor: boolean } | null> {
    const sql = `
      WITH member AS (
        SELECT id FROM staff_users WHERE id = $1 AND organization_id = $2
      ), challenges AS (
        DELETE FROM staff_two_factor_challenges WHERE staff_user_id IN (SELECT id FROM member)
      ), removed AS (
        DELETE FROM staff_two_factor WHERE staff_user_id IN (SELECT id FROM member) RETURNING staff_user_id
      )
      SELECT EXISTS (SELECT 1 FROM removed) AS had FROM member
      `;
    const params = [staffUserId, organizationId];
    if (audit === undefined) {
      const row = (await this.database.query<{ had: boolean }>(sql, params)).rows[0];
      return row === undefined ? null : { hadTwoFactor: row.had };
    }
    // The audit row is saved in the same transaction: no removed two-factor without its row (docs/13 R6-05).
    return this.database.withTransaction(async (client): Promise<{ hadTwoFactor: boolean } | null> => {
      const row = (await client.query<{ had: boolean }>(sql, params)).rows[0];
      if (row === undefined) {
        return null;
      }
      const outcome = { hadTwoFactor: row.had };
      await audit(client, outcome);
      return outcome;
    });
  }

  /** A fresh challenge replaces the person's earlier ones; expired ones of anybody are swept in passing. */
  public async createChallenge(staffUserId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.query('DELETE FROM staff_two_factor_challenges WHERE staff_user_id = $1 OR expires_at <= now()', [staffUserId]);
    await this.database.query(
      'INSERT INTO staff_two_factor_challenges (staff_user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [staffUserId, tokenHash, expiresAt.toISOString()],
    );
  }

  public async findChallenge(tokenHash: string): Promise<ChallengeRecord | null> {
    const result = await this.database.query<ChallengeRow>(
      `
      SELECT c.id, c.staff_user_id, u.organization_id, c.failed_attempts
      FROM staff_two_factor_challenges c
      INNER JOIN staff_users u ON u.id = c.staff_user_id
      WHERE c.token_hash = $1 AND c.expires_at > now() AND u.active
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : { id: row.id, staffUserId: row.staff_user_id, organizationId: row.organization_id, failedAttempts: row.failed_attempts };
  }

  /** Counts a wrong code and returns the total so far. */
  public async recordChallengeFailure(challengeId: string): Promise<number> {
    const result = await this.database.query<{ failed_attempts: number }>(
      'UPDATE staff_two_factor_challenges SET failed_attempts = failed_attempts + 1 WHERE id = $1 RETURNING failed_attempts',
      [challengeId],
    );
    return result.rows[0]?.failed_attempts ?? 0;
  }

  /** Deletes the challenge; true for the one caller that actually removed it (single use under a race). */
  public async deleteChallenge(challengeId: string): Promise<boolean> {
    const result = await this.database.query('DELETE FROM staff_two_factor_challenges WHERE id = $1', [challengeId]);
    return (result.rowCount ?? 0) > 0;
  }
}
