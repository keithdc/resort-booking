// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/booking-source-chip.test.tsx
 * @feature reservations
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BOOKING_SOURCES, bookingSourceLabel } from '@/shared/utils/booking-source';
import { BookingSourceChip } from './booking-source-chip';

describe('BookingSourceChip', () => {
  afterEach(cleanup);

  it.each(BOOKING_SOURCES)('says %s in words, with an icon, and a name a screen reader can use', (source) => {
    render(<BookingSourceChip source={source} />);

    expect(screen.getByText(bookingSourceLabel(source))).toBeTruthy();
    expect(screen.getByLabelText(`Booked via ${bookingSourceLabel(source)}`)).toBeTruthy();
    expect(document.querySelector('svg')).not.toBeNull();
  });
});
