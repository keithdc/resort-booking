/**
 * @file apps/api/src/modules/bookings/dto/staff-actions.dto.ts
 * @feature bookings
 * @dependencies class-validator, class-transformer
 */

import type {
  MarkRefundPaidRequest,
  StaffCancelReason,
  StaffCancelRequest,
  StaffChangeDatesRequest,
  StaffChangeQuoteRequest,
} from '@resort-booking/shared-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { KeepRawValue } from '../../../shared/validation/keep-raw-value';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CANCEL_REASONS: readonly StaffCancelReason[] = ['guest_request', 'property_cancelled', 'goodwill'];
export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

/**
 * Trims a string note and leaves anything else exactly as sent (so a number is rejected, not turned
 * into text by the app's implicit conversion).
 */
function TrimmedNote(): PropertyDecorator {
  return Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() : value;
  });
}

/** A required explanation (3 to 500 characters once trimmed) that is kept on the record. */
class NoteField {
  @TrimmedNote()
  @IsString()
  @MinLength(NOTE_MIN, { message: 'Add a short note (at least 3 characters)' })
  @MaxLength(NOTE_MAX, { message: 'The note can be at most 500 characters' })
  public note!: string;
}

export class StaffCancelDto extends NoteField implements StaffCancelRequest {
  @IsIn(CANCEL_REASONS)
  public reason!: StaffCancelReason;

  /** Only goodwill uses it; the service checks the range against what was paid. */
  @KeepRawValue()
  @ValidateIf((_object: object, value: unknown): boolean => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  public refundCents: number | null = null;
}

export class StaffChangeQuoteDto implements StaffChangeQuoteRequest {
  @Matches(ISO_DATE, { message: 'newCheckIn must be a date like 2027-07-10' })
  public newCheckIn!: string;

  @Matches(ISO_DATE, { message: 'newCheckOut must be a date like 2027-07-12' })
  public newCheckOut!: string;

  @KeepRawValue()
  @IsBoolean()
  public waiveFee!: boolean;
}

export class StaffChangeDatesDto extends StaffChangeQuoteDto implements StaffChangeDatesRequest {
  @TrimmedNote()
  @IsString()
  @MinLength(NOTE_MIN, { message: 'Add a short note (at least 3 characters)' })
  @MaxLength(NOTE_MAX, { message: 'The note can be at most 500 characters' })
  public note!: string;

  @KeepRawValue()
  @IsBoolean()
  public balanceSettledOutside!: boolean;
}

export class MarkRefundPaidDto extends NoteField implements MarkRefundPaidRequest {}
