/**
 * @file apps/api/src/modules/property/dto/upsert-request-option.dto.ts
 * @feature property
 * @dependencies class-validator
 */

import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertRequestOptionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public name!: string;

  @IsString()
  @MaxLength(400)
  public description!: string;

  @IsBoolean()
  public published!: boolean;
}
