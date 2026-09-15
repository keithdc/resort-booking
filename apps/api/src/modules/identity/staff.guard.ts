/**
 * @file apps/api/src/modules/identity/staff.guard.ts
 * @feature identity
 * @dependencies @nestjs/common
 */

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class StaffGuard implements CanActivate {
  public constructor(private readonly config: ConfigService) {}

  /**
   * Prototype staff gate. Guest tokens must never satisfy this.
   */
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('x-staff-token');
    const expected = this.config.getOrThrow<string>('STAFF_TOKEN');
    if (header !== expected) {
      throw new UnauthorizedException({
        message: 'Staff authentication required',
        code: 'STAFF_UNAUTHORIZED',
      });
    }
    return true;
  }
}
