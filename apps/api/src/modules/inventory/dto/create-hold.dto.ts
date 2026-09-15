/**
 * @file apps/api/src/modules/inventory/dto/create-hold.dto.ts
 * @feature inventory
 * @dependencies class-validator
 */

import { IsEmail, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateHoldRequest, PaymentMethod } from '@resort-booking/shared-types';

export class CreateHoldDto implements CreateHoldRequest {
  @IsUUID()
  public houseId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  public checkIn!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  public checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  public guestCount!: number;

  @IsIn(['card', 'bank_transfer'])
  public paymentMethod!: PaymentMethod;

  @IsString()
  @MaxLength(120)
  public bookerName!: string;

  @IsEmail()
  public bookerEmail!: string;

  @IsString()
  @MaxLength(40)
  public bookerPhone!: string;
}
