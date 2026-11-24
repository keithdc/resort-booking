/**
 * @file apps/admin/src/features/reporting/utils/metric-definitions.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import {
  BANNED_REPORT_WORDS,
  EMPTY_STATES,
  METRIC_DEFINITIONS,
  SECTION_CAPTIONS,
  TAB_PURPOSES,
  type EmptyStateKey,
  type MetricKey,
  type ReportTabKey,
  type SectionKey,
} from './metric-definitions';

const KEYS = Object.keys(METRIC_DEFINITIONS) as MetricKey[];

describe('METRIC_DEFINITIONS', () => {
  it('defines every metric the page shows', () => {
    for (const key of [
      'revenue', 'grossRevenue', 'refunded', 'bookings', 'occupancy', 'averageNightlyRate', 'cancelledBookings',
      'cancellationRate', 'refundsToPay', 'unpaidHolds', 'arrivalsToday', 'arrivalsNext7Days', 'revenueShare',
      'paymentMethod', 'discountGiven', 'discountUses',
    ] satisfies MetricKey[]) {
      expect(METRIC_DEFINITIONS[key].label.trim()).not.toBe('');
      expect(METRIC_DEFINITIONS[key].definition.trim().length).toBeGreaterThan(20);
    }
  });

  it('writes every definition as a sentence that ends with a full stop', () => {
    for (const key of KEYS) {
      expect(METRIC_DEFINITIONS[key].definition.endsWith('.')).toBe(true);
    }
  });

  it('keeps jargon out of labels and definitions', () => {
    for (const key of KEYS) {
      const text = `${METRIC_DEFINITIONS[key].label} ${METRIC_DEFINITIONS[key].definition}`.toLowerCase();
      for (const word of BANNED_REPORT_WORDS) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('gives each metric a distinct label', () => {
    const labels = KEYS.map((key) => METRIC_DEFINITIONS[key].label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

const SECTIONS = Object.keys(SECTION_CAPTIONS) as SectionKey[];
const TABS = Object.keys(TAB_PURPOSES) as ReportTabKey[];
const EMPTIES = Object.keys(EMPTY_STATES) as EmptyStateKey[];

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter((part: string): boolean => part.trim() !== '').length;
}

describe('SECTION_CAPTIONS', () => {
  it('gives every section on the page a title and a caption', () => {
    expect(SECTIONS.sort()).toEqual(
      ['atAGlance', 'attention', 'revenueChart', 'insights', 'propertiesTable', 'bookingsTable', 'cancellationSummary', 'cancellationReasons', 'refundsList', 'paymentMethods', 'discounts'].sort(),
    );
    for (const key of SECTIONS) {
      expect(SECTION_CAPTIONS[key].title.trim()).not.toBe('');
      expect(SECTION_CAPTIONS[key].caption.trim().length).toBeGreaterThan(30);
    }
  });

  it('keeps each caption to one or two sentences ending with a full stop', () => {
    for (const key of SECTIONS) {
      const { caption } = SECTION_CAPTIONS[key];
      expect(caption.endsWith('.')).toBe(true);
      expect(sentenceCount(caption)).toBeLessThanOrEqual(2);
    }
  });

  it('keeps jargon out of titles and captions', () => {
    for (const key of SECTIONS) {
      const text = `${SECTION_CAPTIONS[key].title} ${SECTION_CAPTIONS[key].caption}`.toLowerCase();
      for (const word of BANNED_REPORT_WORDS) {
        expect(text).not.toContain(word);
      }
    }
  });
});

describe('TAB_PURPOSES', () => {
  it('gives each of the five tabs a one-line purpose', () => {
    expect(TABS.sort()).toEqual(['bookings', 'cancellations', 'overview', 'payments', 'properties']);
    for (const key of TABS) {
      expect(TAB_PURPOSES[key].endsWith('.')).toBe(true);
      expect(sentenceCount(TAB_PURPOSES[key])).toBe(1);
    }
  });
});

describe('EMPTY_STATES', () => {
  it('says what to do, not just that it is empty', () => {
    for (const key of EMPTIES) {
      const text = EMPTY_STATES[key];
      expect(text.endsWith('.')).toBe(true);
      expect(text.length).toBeGreaterThan(40);
    }
  });

  it('keeps jargon out', () => {
    for (const key of EMPTIES) {
      for (const word of BANNED_REPORT_WORDS) {
        expect(EMPTY_STATES[key].toLowerCase()).not.toContain(word);
      }
    }
  });

  it('covers every empty screen of the page', () => {
    expect(EMPTIES.sort()).toEqual(
      ['noBookings', 'noSearchMatches', 'noProperties', 'noChartData', 'noCancellations', 'noRefunds', 'noPayments', 'noDiscounts', 'nothingNeedsAttention', 'noReport'].sort(),
    );
  });
});
