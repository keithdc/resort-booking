/**
 * @file apps/api/src/modules/identity/identity.service.ts
 * @feature identity
 * @dependencies DatabaseService
 */

import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChangeStaffPasswordRequest,
  Organization,
  OrganizationSettings,
  StaffLoginResult,
  StaffProfile,
  UpdateOrganizationSettingsRequest,
  UpdateStaffProfileRequest,
} from '@resort-booking/shared-types';
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  passwordIssue,
  verifyPassword,
} from './identity.password';
import { IdentityRepository } from './identity.repository';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class IdentityService implements OnModuleInit {
  public constructor(
    private readonly identity: IdentityRepository,
    private readonly config: ConfigService,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.ensureOwnerAccount();
  }

  public async getOrganization(): Promise<Organization | null> {
    const settings = await this.identity.getSettings();
    if (settings === null) {
      return null;
    }
    return { id: settings.id, name: settings.name };
  }

  public async getSettings(): Promise<OrganizationSettings> {
    const settings = await this.identity.getSettings();
    if (settings === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    return settings;
  }

  public async updateSettings(input: UpdateOrganizationSettingsRequest): Promise<OrganizationSettings> {
    const current = await this.getSettings();
    const saved = await this.identity.updateSettings(current.id, input);
    if (saved === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    return saved;
  }

  public async login(email: string, password: string): Promise<StaffLoginResult> {
    const staff = await this.identity.findStaffByEmail(email.trim());
    if (staff === null || !(await verifyPassword(password, staff.passwordHash))) {
      throw new UnauthorizedException({ message: 'Email or password is wrong', code: 'STAFF_LOGIN_FAILED' });
    }
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_MS);
    await this.identity.createSession(staff.id, hashSessionToken(token), expiresAt);
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      staff: { id: staff.id, organizationId: staff.organizationId, fullName: staff.fullName, email: staff.email },
    };
  }

  public async logout(token: string): Promise<void> {
    await this.identity.deleteSessionByTokenHash(hashSessionToken(token));
  }

  public async staffFromToken(token: string): Promise<StaffProfile | null> {
    const expected = this.config.get<string>('STAFF_TOKEN');
    if (expected !== undefined && expected !== '' && token === expected) {
      const ownerEmail = this.config.get<string>('STAFF_OWNER_EMAIL') ?? 'owner@atlantic.example';
      const owner = (await this.identity.findStaffByEmail(ownerEmail)) ?? (await this.identity.findFirstStaff());
      if (owner === null) {
        return null;
      }
      return { id: owner.id, organizationId: owner.organizationId, fullName: owner.fullName, email: owner.email };
    }
    return this.identity.findStaffBySessionTokenHash(hashSessionToken(token));
  }

  public async updateProfile(staffId: string, input: UpdateStaffProfileRequest): Promise<StaffProfile> {
    const email = input.email.trim().toLowerCase();
    if (email === '' || input.fullName.trim() === '') {
      throw new BadRequestException({ message: 'Name and email are required', code: 'STAFF_PROFILE_INVALID' });
    }
    const saved = await this.identity.updateStaffProfile(staffId, input.fullName.trim(), email);
    if (saved === null) {
      throw new NotFoundException({ message: 'Staff not found', code: 'STAFF_NOT_FOUND' });
    }
    return saved;
  }

  public async changePassword(staffId: string, input: ChangeStaffPasswordRequest): Promise<void> {
    const issue = passwordIssue(input.newPassword);
    if (issue !== null) {
      throw new BadRequestException({ message: issue, code: 'STAFF_PASSWORD_WEAK' });
    }
    const staff = await this.identity.findStaffById(staffId);
    if (staff === null) {
      throw new NotFoundException({ message: 'Staff not found', code: 'STAFF_NOT_FOUND' });
    }
    if (!(await verifyPassword(input.currentPassword, staff.passwordHash))) {
      throw new UnauthorizedException({ message: 'Current password is wrong', code: 'STAFF_PASSWORD_MISMATCH' });
    }
    await this.identity.updateStaffPassword(staffId, await hashPassword(input.newPassword));
  }

  private async ensureOwnerAccount(): Promise<void> {
    if ((await this.identity.countStaffUsers()) > 0) {
      return;
    }
    const settings = await this.identity.getSettings();
    if (settings === null) {
      return;
    }
    const email = (this.config.get<string>('STAFF_OWNER_EMAIL') ?? 'owner@atlantic.example').toLowerCase();
    const password = this.config.get<string>('STAFF_OWNER_PASSWORD') ?? 'AtlanticOwner1!';
    const name = settings.ownerName === '' ? settings.name : settings.ownerName;
    await this.identity.insertStaffUser(settings.id, name, email, await hashPassword(password));
  }
}
