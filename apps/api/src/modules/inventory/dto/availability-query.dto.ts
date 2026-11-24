/**
 * @file apps/api/src/modules/inventory/dto/availability-query.dto.ts
 * @feature inventory
 * @dependencies class-validator
 */

import { IsOptional, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PropertyAvailabilityQueryDto {
  @IsOptional()
  @Matches(ISO_DATE)
  public from?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  public to?: string;
}

export class HouseAvailabilityQueryDto extends PropertyAvailabilityQueryDto {
  @IsOptional()
  @Matches(ISO_DATE)
  public checkIn?: string;
}
