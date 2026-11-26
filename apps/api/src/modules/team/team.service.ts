/**
 * @file apps/api/src/modules/team/team.service.ts
 * @feature team
 * @dependencies TeamRepository, IdentityService, AuditService, MailService, TeamLimiter
 */

import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TwoFactorResetResult } from '@resort-booking/shared-types';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditActor } from '../../shared/audit/audit.types';
import { isProduction, readIntEnv } from '../../shared/config/environment';
import { parseAdminAppUrl } from '../../shared/mail/mail.config';
import { MailService } from '../../shared/mail/mail.service';
import { createSessionToken, hashPassword, hashSessionToken } from '../identity/identity.password';
import { IdentityService, isUniqueViolation } from '../identity/identity.service';
import type { StaffAccount, StaffRole, StaffSessionResult } from '../../shared/roles/staff-role';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { CreateInviteDto } from './dto/create-invite.dto';
import type { RegisterDto } from './dto/register.dto';
import { TeamLimiter } from './team-limiter';
import { inviteLink, renderInviteMail } from './team-mail';
import { TeamRepository, type InviteRecord } from './team.repository';
import { inviteIsOpen, isRegistrationOpen, memberChangeAction, type MemberRefusal } from './team.rules';
import type { InviteEmailStatus, InviteIssued, InvitePreview, MemberChange, RegistrationStatus, TeamMember, TeamOverview } from './team.types';

const DEFAULT_INVITE_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;

/** Where a public request came from. */
export interface PublicContext {
  ip: string | undefined;
  requestId: string | undefined;
}

/** The signed-in admin making a team change, with where the request came from. */
export interface TeamActor {
  staff: StaffAccount;
  ip: string | undefined;
  requestId: string | undefined;
}

@Injectable()
export class TeamService {
  private readonly logger = new Logger('Team');
  private readonly inviteHours: number;
  private readonly registrationOpen: boolean;
  private readonly adminAppUrl: string | null;

  public constructor(
    private readonly team: TeamRepository,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    private readonly limiter: TeamLimiter,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.inviteHours = readIntEnv({ v: config.get<string>('INVITE_TTL_HOURS') }, 'v', DEFAULT_INVITE_HOURS, 1, 720);
    this.adminAppUrl = parseAdminAppUrl(config.get<string>('ADMIN_APP_URL'));
    this.registrationOpen = isRegistrationOpen(config.get<string>('ALLOW_REGISTRATION'), isProduction(process.env));
  }

  public status(): RegistrationStatus {
    return { open: this.registrationOpen };
  }

  /**
   * Creates a workspace and its first admin, and signs them in. Closed by default in production. The
   * duplicate-email answer (409 EMAIL_TAKEN) does tell a caller that an address has an account; that is the
   * usual trade-off for a sign-up form, so it is rate limited per IP and per email, and registration is shut
   * in production unless the operator turns it on.
   */
  public async register(input: RegisterDto, context: PublicContext): Promise<StaffSessionResult> {
    if (!this.registrationOpen) {
      throw new ForbiddenException({ message: 'Registration is closed on this server', code: 'REGISTRATION_CLOSED' });
    }
    const email = input.email.trim().toLowerCase();
    const organizationName = input.organizationName.trim();
    const fullName = input.fullName.trim();
    if (organizationName.length < 2 || fullName.length < 2) {
      throw new BadRequestException({ message: 'Enter your name and the name of your business', code: 'REGISTRATION_INVALID' });
    }
    await this.limiter.checkRegistration(context.ip, email);
    this.identity.assertPasswordAcceptable(input.password, email);
    if (await this.team.emailInUse(email)) {
      throw this.emailTaken();
    }
    const passwordHash = await hashPassword(input.password);
    let account: StaffAccount;
    try {
      account = await this.team.registerWorkspace({ organizationName, fullName, email, passwordHash });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw this.emailTaken();
      }
      throw error;
    }
    const session = await this.identity.startSession(account, context);
    this.logger.log(`register staff=${account.id} org=${account.organizationId} req=${context.requestId ?? 'none'}`);
    await this.audit.recordBy(this.actorOf(account, context), 'auth.register', { targetType: 'organization', targetId: account.organizationId });
    return session;
  }

  public async overview(staff: StaffAccount): Promise<TeamOverview> {
    const [members, invites] = await Promise.all([
      this.team.listMembers(staff.organizationId, staff.id),
      this.team.listOpenInvites(staff.organizationId, new Date()),
    ]);
    return { members, invites, mailEnabled: this.mailAvailable() };
  }

  /**
   * Invites someone. The link's token is in the answer ONCE (only its hash is stored); an open invitation for
   * the same email is replaced. An email that already has an account anywhere cannot be invited.
   */
  public async createInvite(actor: TeamActor, input: CreateInviteDto): Promise<InviteIssued> {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (fullName.length < 2) {
      throw new BadRequestException({ message: 'Enter the person\'s name', code: 'INVITE_INVALID_INPUT' });
    }
    if (await this.team.emailInUse(email)) {
      throw this.emailTaken();
    }
    const canManageRefunds = input.role === 'employee' && input.canManageRefunds === true;
    const issued = await this.issue(actor, { email, fullName, role: input.role, canManageRefunds, staffUserId: null }, input.sendEmail === true);
    await this.audit.recordBy(auditActor(actor), 'team.invite_created', {
      targetType: 'staff_invite',
      targetId: issued.invite.id,
      metadata: { role: input.role, canManageRefunds, emailed: issued.emailStatus === 'sent' },
    });
    return issued;
  }

  public async revokeInvite(actor: TeamActor, inviteId: string): Promise<void> {
    const revoked = await this.team.revokeInvite(actor.staff.organizationId, inviteId);
    if (revoked === null) {
      throw new NotFoundException({ message: 'Invitation not found', code: 'INVITE_NOT_FOUND' });
    }
    await this.audit.recordBy(auditActor(actor), 'team.invite_revoked', { targetType: 'staff_invite', targetId: inviteId });
  }

  /**
   * Changes a member's role, switches them on or off, and/or grants or removes refund access. Never leaves the
   * workspace without an active admin, never switches the caller off; switching someone off ends their sessions.
   * Refund access is for employees, never for an admin or for yourself. It needs no session change: the API reads it
   * from the database on every request, so it applies from the member's next call.
   */
  public async updateMember(actor: TeamActor, staffId: string, change: MemberChange): Promise<TeamMember> {
    if (change.role === undefined && change.active === undefined && change.canManageRefunds === undefined) {
      throw new BadRequestException({ message: 'Nothing to change', code: 'NOTHING_TO_CHANGE' });
    }
    const outcome = await this.team.changeMember(actor.staff.organizationId, actor.staff.id, staffId, change);
    if (outcome.kind === 'refused') {
      throw this.refusal(outcome.code);
    }
    const members = await this.team.listMembers(actor.staff.organizationId, actor.staff.id);
    const updated = members.find((member): boolean => member.id === staffId);
    if (updated === undefined) {
      throw new NotFoundException({ message: 'Team member not found', code: 'STAFF_NOT_FOUND' });
    }
    for (const action of memberChangeAction(outcome.before, outcome.after)) {
      await this.audit.recordBy(auditActor(actor), action, {
        targetType: 'staff_user',
        targetId: staffId,
        metadata: {
          role: outcome.after.role,
          canManageRefunds: outcome.after.canManageRefunds,
          memberName: updated.fullName,
          changedByName: actor.staff.fullName,
          changedByRole: actor.staff.role,
        },
      });
    }
    return updated;
  }

  /**
   * Ends all of a member's sessions and issues a one-time link they use to choose a new password. For a lost
   * password or a lost device. Not for yourself (use Change password).
   */
  public async resetAccess(actor: TeamActor, staffId: string, options: { sendEmail?: boolean | undefined } = {}): Promise<InviteIssued> {
    if (staffId === actor.staff.id) {
      throw new BadRequestException({ message: 'Use Change password for your own account', code: 'USE_PASSWORD_CHANGE' });
    }
    const member = await this.team.findMember(actor.staff.organizationId, staffId);
    if (member === null) {
      throw new NotFoundException({ message: 'Team member not found', code: 'STAFF_NOT_FOUND' });
    }
    if (!member.active) {
      throw new ConflictException({ message: 'Switch this person on before resetting their access', code: 'MEMBER_INACTIVE' });
    }
    await this.identity.logoutAll(staffId);
    const issued = await this.issue(
      actor,
      { email: member.email, fullName: member.fullName, role: member.role, canManageRefunds: false, staffUserId: staffId },
      options.sendEmail === true,
    );
    await this.audit.recordBy(auditActor(actor), 'team.access_reset', {
      targetType: 'staff_user',
      targetId: staffId,
      metadata: { inviteId: issued.invite.id, emailed: issued.emailStatus === 'sent' },
    });
    return issued;
  }

  /**
   * Lost phone: removes a member's two-factor and ends their sessions, so they sign in with just their password
   * and can set it up again. Not for yourself (use Account > Two-factor).
   */
  public async resetTwoFactor(actor: TeamActor, staffId: string): Promise<TwoFactorResetResult> {
    if (staffId === actor.staff.id) {
      throw new BadRequestException({ message: 'Use Account to turn off your own two-factor', code: 'USE_TWO_FACTOR_DISABLE' });
    }
    const outcome = await this.identity.resetTwoFactor(actor.staff.organizationId, staffId);
    await this.audit.recordBy(auditActor(actor), 'team.two_factor_reset', {
      targetType: 'staff_user',
      targetId: staffId,
      metadata: { hadTwoFactor: outcome.hadTwoFactor },
    });
    return outcome;
  }

  /**
   * What the invitation page may show. An unknown, used, revoked and expired link all answer the same 404 so
   * a caller learns nothing from the difference.
   */
  public async preview(token: string, context: PublicContext): Promise<InvitePreview> {
    await this.limiter.checkInvitePreview(context.ip);
    const invite = await this.openInvite(token);
    return { organizationName: invite.organizationName, email: invite.email, role: invite.role, isReset: invite.staffUserId !== null };
  }

  /**
   * Uses the link: creates the account (or sets the new password for a reset link) and signs the person in.
   * The password policy is checked against the invited email.
   */
  public async accept(input: AcceptInviteDto, context: PublicContext): Promise<StaffSessionResult> {
    await this.limiter.checkInviteAccept(context.ip);
    const invite = await this.openInvite(input.token);
    this.identity.assertPasswordAcceptable(input.password, invite.email);
    if (invite.staffUserId === null && (await this.team.emailInUse(invite.email))) {
      throw this.emailTaken();
    }
    const passwordHash = await hashPassword(input.password);
    // A reset link only sets a password: it never renames an existing member, whatever the body says.
    const trimmed = invite.staffUserId === null ? input.fullName?.trim() : undefined;
    let used: Awaited<ReturnType<TeamRepository['acceptInvite']>>;
    try {
      used = await this.team.acceptInvite({
        tokenHash: hashSessionToken(input.token),
        passwordHash,
        fullName: trimmed === undefined || trimmed.length < 2 ? null : trimmed,
        now: new Date(),
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw this.emailTaken();
      }
      throw error;
    }
    if (used === null) {
      throw this.invalidInvite();
    }
    const session = await this.identity.startSession(used.account, context);
    await this.audit.recordBy(this.actorOf(used.account, context), used.reset ? 'auth.access_reset_completed' : 'team.invite_accepted', {
      targetType: 'staff_invite',
      targetId: used.inviteId,
    });
    return session;
  }

  private async issue(
    actor: TeamActor,
    input: { email: string; fullName: string; role: StaffRole; canManageRefunds: boolean; staffUserId: string | null },
    sendEmail: boolean,
  ): Promise<InviteIssued> {
    const token = createSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.inviteHours * HOUR_MS);
    const invite = await this.team.issueInvite({
      organizationId: actor.staff.organizationId,
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      canManageRefunds: input.canManageRefunds,
      staffUserId: input.staffUserId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      createdBy: actor.staff.id,
      now,
    });
    const issued: InviteIssued = { invite, inviteToken: token, expiresAt: expiresAt.toISOString() };
    if (!sendEmail) {
      return issued;
    }
    // The invite exists now; whatever happens to the email must not undo or fail it.
    const emailStatus = await this.emailLink(actor, input, token, expiresAt);
    return { ...issued, emailStatus };
  }

  private mailAvailable(): boolean {
    return this.mail.enabled && this.adminAppUrl !== null;
  }

  /** Tries to email the link. Never throws and never logs the token or the link. */
  private async emailLink(
    actor: TeamActor,
    input: { email: string; fullName: string; role: StaffRole; staffUserId: string | null },
    token: string,
    expiresAt: Date,
  ): Promise<InviteEmailStatus> {
    if (!this.mailAvailable() || this.adminAppUrl === null) {
      return 'not_configured';
    }
    try {
      if (!(await this.limiter.allowInviteEmail(actor.staff.organizationId, input.email))) {
        return 'failed';
      }
      const rendered = renderInviteMail({
        recipientName: input.fullName,
        inviterName: actor.staff.fullName,
        organizationName: actor.staff.organizationName,
        role: input.role,
        link: inviteLink(this.adminAppUrl, token),
        expiresAt,
        isReset: input.staffUserId !== null,
      });
      const result = await this.mail.send({ to: input.email, ...rendered, requestId: actor.requestId });
      return result.status === 'sent' ? 'sent' : result.status === 'not_configured' ? 'not_configured' : 'failed';
    } catch {
      this.logger.warn(`invite email failed unexpectedly req=${actor.requestId ?? 'none'}`);
      return 'failed';
    }
  }

  private async openInvite(token: string): Promise<InviteRecord> {
    const invite = await this.team.findInviteByTokenHash(hashSessionToken(token));
    if (invite === null || !inviteIsOpen(invite, new Date())) {
      throw this.invalidInvite();
    }
    return invite;
  }

  private invalidInvite(): NotFoundException {
    return new NotFoundException({ message: 'This link is not valid any more. Ask your admin for a new one.', code: 'INVITE_INVALID' });
  }

  private emailTaken(): ConflictException {
    return new ConflictException({ message: 'An account with this email already exists. Sign in instead.', code: 'EMAIL_TAKEN' });
  }

  private refusal(code: MemberRefusal): Error {
    switch (code) {
      case 'STAFF_NOT_FOUND':
        return new NotFoundException({ message: 'Team member not found', code });
      case 'LAST_ADMIN':
        return new ConflictException({ message: 'The workspace needs at least one active admin', code });
      case 'CANNOT_DEACTIVATE_SELF':
        return new ConflictException({ message: 'You cannot switch yourself off: ask another admin', code });
      case 'NOTHING_TO_CHANGE':
        return new BadRequestException({ message: 'Nothing to change', code });
      case 'REFUND_ACCESS_NOT_FOR_ADMIN':
        return new BadRequestException({ message: 'Admins always have refund access. It can only be given to employees.', code });
      case 'CANNOT_CHANGE_OWN_REFUND_ACCESS':
        return new BadRequestException({ message: 'You cannot change your own refund access: ask another admin', code });
    }
  }

  private actorOf(account: StaffAccount, context: PublicContext): AuditActor {
    return { organizationId: account.organizationId, staffUserId: account.id, ip: context.ip, requestId: context.requestId };
  }
}

function auditActor(actor: TeamActor): AuditActor {
  return { organizationId: actor.staff.organizationId, staffUserId: actor.staff.id, ip: actor.ip, requestId: actor.requestId };
}
