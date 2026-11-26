/**
 * @file apps/api/src/shared/audit/audit.service.ts
 * @shared ONE place that writes and reads the audit log
 * @dependencies AuditRepository
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fingerprint } from '../http/client-ip';
import { AuditRepository } from './audit.repository';
import type { AuditActor, AuditEntry, AuditFilters, AuditPage } from './audit.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const ACTION_PREFIX = /^[a-z_.]{1,40}$/;
const SEPARATOR = '|';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  private readonly salt: string;

  public constructor(
    private readonly audit: AuditRepository,
    config: ConfigService,
  ) {
    this.salt = config.get<string>('IP_HASH_SALT') ?? '';
  }

  /**
   * Writes one row. NEVER throws: a failing log must not turn a finished action into an error for the user, so
   * a failure is only logged (without the entry's details). Returns whether the row was written.
   */
  public async record(entry: AuditEntry): Promise<boolean> {
    try {
      await this.audit.insert(entry);
      return true;
    } catch (error: unknown) {
      this.logger.error(`Could not write audit row "${entry.action}": ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  /**
   * Records an action by a signed-in person: the actor carries the organization, the person, the IP (hashed
   * here, never stored) and the request id.
   */
  public recordBy(actor: AuditActor, action: string, details: Omit<AuditEntry, 'organizationId' | 'staffUserId' | 'action' | 'ipHash' | 'requestId'> = {}): Promise<boolean> {
    return this.record({
      ...details,
      organizationId: actor.organizationId,
      staffUserId: actor.staffUserId,
      action,
      ipHash: actor.ip === undefined ? null : this.hashIp(actor.ip),
      requestId: actor.requestId ?? null,
    });
  }

  /** One-way hash of an IP with the deployment's salt. */
  public hashIp(ip: string): string {
    return fingerprint(ip, this.salt);
  }

  /** One-way hash of an email, for sign-in events: the address itself is never written to the log. */
  public hashEmail(email: string): string {
    return fingerprint(email, this.salt);
  }

  /**
   * A page of this organization's log, newest first. A malformed cursor or action filter is a 400, never a
   * query.
   */
  public async list(organizationId: string, filters: AuditFilters): Promise<AuditPage> {
    const actionPrefix = filters.actionPrefix ?? null;
    if (actionPrefix !== null && !ACTION_PREFIX.test(actionPrefix)) {
      throw new BadRequestException({ message: 'Invalid action filter', code: 'AUDIT_FILTER_INVALID' });
    }
    const limit = Math.min(Math.max(Math.trunc(filters.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const page = await this.audit.page({
      organizationId,
      actionPrefix,
      from: filters.from ?? null,
      to: filters.to ?? null,
      after: filters.cursor === undefined ? null : this.decodeCursor(filters.cursor),
      limit,
    });
    return {
      items: page.records,
      nextCursor: page.hasMore && page.last !== null ? encodeCursor(page.last) : null,
    };
  }

  private decodeCursor(cursor: string): { createdAt: string; id: string } {
    const invalid = new BadRequestException({ message: 'Invalid cursor', code: 'AUDIT_CURSOR_INVALID' });
    let text: string;
    try {
      text = Buffer.from(cursor, 'base64url').toString('utf8');
    } catch {
      throw invalid;
    }
    const [createdAt, id, ...rest] = text.split(SEPARATOR);
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (rest.length > 0 || createdAt === undefined || id === undefined || !timestamp.test(createdAt) || !uuid.test(id)) {
      throw invalid;
    }
    return { createdAt, id };
  }
}

function encodeCursor(last: { createdAt: string; id: string }): string {
  return Buffer.from(`${last.createdAt}${SEPARATOR}${last.id}`, 'utf8').toString('base64url');
}
