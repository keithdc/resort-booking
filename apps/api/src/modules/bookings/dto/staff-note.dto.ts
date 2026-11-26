/**
 * @file apps/api/src/modules/bookings/dto/staff-note.dto.ts
 * @feature bookings
 * @dependencies class-validator, class-transformer
 */

import type { CreateStaffNoteRequest } from '@resort-booking/shared-types';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength, registerDecorator, type ValidationOptions } from 'class-validator';
import { LIMITS } from '../../../shared/validation/limits';

/**
 * True when the text holds only printable characters plus newline and tab. Other control characters (and a bare carriage
 * return) are refused. Checked by character code, so no pattern has to spell the control characters out.
 */
export function hasOnlyNoteCharacters(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const control = code < 32 || code === 127;
    if (control && code !== 10 && code !== 9) {
      return false;
    }
  }
  return true;
}

/** Validation decorator form of hasOnlyNoteCharacters. */
function NoteCharacters(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'noteCharacters',
      target: target.constructor,
      propertyName: String(propertyName),
      ...(options === undefined ? {} : { options }),
      validator: { validate: (value: unknown): boolean => typeof value === 'string' && hasOnlyNoteCharacters(value) },
    });
  };
}

/** A staff note: 1 to 2000 characters once trimmed, no control characters beyond newline and tab. */
export class CreateStaffNoteDto implements CreateStaffNoteRequest {
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @MinLength(1, { message: 'Write a note first' })
  @MaxLength(LIMITS.note, { message: 'A note can be at most 2000 characters' })
  @NoteCharacters({ message: 'The note contains characters that are not allowed' })
  public body!: string;
}
