/**
 * @file apps/api/src/modules/inventory/dto/create-hold.dto.ts
 * @feature inventory
 * @dependencies class-validator
 */

import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateHoldRequest, PaymentMethod } from '@resort-booking/shared-types';
import { KeepRawValue } from '../../../shared/validation/keep-raw-value';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';
import { LIMITS } from '../../../shared/validation/limits';

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
  @MinLength(1)
  @MaxLength(LIMITS.name)
  public bookerName!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  public bookerEmail!: string;

  // International format (+33...), checked against real numbering plans.
  @IsPhoneNumber(undefined, { message: 'bookerPhone must be a valid international phone number, like +33612345678' })
  @MaxLength(40)
  public bookerPhone!: string;

  // A legal acceptance must be a real boolean true, not "yes" converted to one.
  @KeepRawValue()
  @IsBoolean()
  @Equals(true, { message: 'You must confirm you have read the cancellation terms before booking' })
  public termsAccepted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  public promoCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.note)
  public guestNote: string = '';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIMITS.requestOptions)
  @Matches(UUID_LIKE, { each: true })
  public requestOptionIds: string[] = [];
}
