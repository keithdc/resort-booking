/**
 * @file apps/api/src/modules/inventory/dto/create-hold.dto.ts
 * @feature inventory
 * @dependencies class-validator
 */

import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsPhoneNumber, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateHoldRequest, PaymentMethod } from '@resort-booking/shared-types';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';

export class CreateHoldDto implements CreateHoldRequest {
  @Matches(UUID_LIKE)
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

  // International format (+33...), checked against real numbering plans.
  @IsPhoneNumber(undefined, { message: 'bookerPhone must be a valid international phone number, like +33612345678' })
  @MaxLength(40)
  public bookerPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  public promoCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public guestNote: string = '';

  @IsOptional()
  @IsArray()
  @Matches(UUID_LIKE, { each: true })
  public requestOptionIds: string[] = [];
}
