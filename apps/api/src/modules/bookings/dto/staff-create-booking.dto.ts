/**
 * @file apps/api/src/modules/bookings/dto/staff-create-booking.dto.ts
 * @feature bookings
 * @dependencies class-validator, class-transformer
 */

import type { StaffBookingExtraChoice, StaffBookingQuoteRequest, StaffCreateBookingRequest } from '@resort-booking/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_EXTRA_QUANTITY, MAX_EXTRAS_PER_BOOKING } from '../../extras/booking-extras';
import { LIMITS } from '../../../shared/validation/limits';
import { UUID_LIKE } from '../../../shared/validation/uuid-like';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Trims a string and leaves anything else exactly as sent, so a wrong type is refused instead of converted. */
function Trimmed(): PropertyDecorator {
  return Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() : value;
  });
}

/** One extra of the stay's property, and how many. */
export class StaffBookingExtraChoiceDto implements StaffBookingExtraChoice {
  @Matches(UUID_LIKE)
  public extraId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_EXTRA_QUANTITY)
  public quantity!: number;
}

/** The stay, the dates, the party size and the extras: enough to price a booking. */
export class StaffBookingQuoteDto implements StaffBookingQuoteRequest {
  @Matches(UUID_LIKE)
  public houseId!: string;

  @Matches(ISO_DATE, { message: 'checkIn must be a date like 2027-07-10' })
  public checkIn!: string;

  @Matches(ISO_DATE, { message: 'checkOut must be a date like 2027-07-12' })
  public checkOut!: string;

  @IsInt()
  @Min(1)
  @Max(LIMITS.capacity)
  public guestCount!: number;

  /** Optional. Each extra once; the API checks they are published extras of this stay's property. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EXTRAS_PER_BOOKING)
  @ValidateNested({ each: true })
  @Type(() => StaffBookingExtraChoiceDto)
  public extras?: StaffBookingExtraChoiceDto[];
}

/**
 * A booking made by staff for a guest who pays at the property. The terms flag of the public form does not exist
 * here: staff speak for the guest, and the booking records that no guest accepted terms online.
 */
export class StaffCreateBookingDto extends StaffBookingQuoteDto implements StaffCreateBookingRequest {
  /** Only pay at hotel is open for now. A card payment link will add a second value. */
  @IsIn(['pay_at_hotel'])
  public paymentMethod!: 'pay_at_hotel';

  @Trimmed()
  @IsString()
  @MinLength(1, { message: 'Enter the guest\'s name' })
  @MaxLength(LIMITS.name)
  public bookerName!: string;

  @Trimmed()
  @IsEmail()
  @MaxLength(LIMITS.email)
  public bookerEmail!: string;

  /** Optional. When given: international format, checked against real numbering plans. */
  @Trimmed()
  @ValidateIf((_object: object, value: unknown): boolean => value !== undefined && value !== '')
  @IsPhoneNumber(undefined, { message: 'bookerPhone must be a valid international phone number, like +33612345678' })
  @MaxLength(LIMITS.phone)
  public bookerPhone: string = '';

  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(LIMITS.note)
  public guestNote: string = '';
}
