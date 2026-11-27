import { describe, expect, it } from 'vitest';
import { BOOKING_SOURCES, bookingSourceLabel, correctableSources, isChannelSource } from './booking-source';

describe('booking sources', () => {
  it('names the six sources in plain words', () => {
    expect(BOOKING_SOURCES.map(bookingSourceLabel)).toEqual(['Our website', 'Airbnb', 'Booking.com', 'Another website', 'Phone or email', 'Walk-in']);
  });

  it('knows which sources are other sites (they collected the money) and which are the property\'s own', () => {
    expect(BOOKING_SOURCES.filter(isChannelSource)).toEqual(['airbnb', 'booking_com', 'other_site']);
  });

  it('offers a correction only inside the same group, never the current value and never across the groups', () => {
    expect(correctableSources('airbnb')).toEqual(['booking_com', 'other_site']);
    expect(correctableSources('other_site')).toEqual(['airbnb', 'booking_com']);
    expect(correctableSources('phone_email')).toEqual(['website', 'walk_in']);
    expect(correctableSources('website')).toEqual(['phone_email', 'walk_in']);
    for (const source of BOOKING_SOURCES) {
      for (const option of correctableSources(source)) {
        expect(isChannelSource(option)).toBe(isChannelSource(source));
        expect(option).not.toBe(source);
      }
    }
  });
});
