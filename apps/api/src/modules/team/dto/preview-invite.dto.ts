/**
 * @file apps/api/src/modules/team/dto/preview-invite.dto.ts
 * @feature team
 * @dependencies class-validator
 */

import { IsString, Matches } from 'class-validator';

/** The invitation page sends the token in the body, so it never sits in a URL, an access log or a Referer header. */
export class PreviewInviteDto {
  /** 64 hex characters, as issued. Anything else cannot be a token. */
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  public token!: string;
}
