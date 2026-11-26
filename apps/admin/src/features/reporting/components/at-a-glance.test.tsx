// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/at-a-glance.test.tsx
 * @feature reporting
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { periodSummary, staffReport } from '@/test/fixtures';
import { AtAGlance } from './at-a-glance';

describe('AtAGlance', () => {
  afterEach(cleanup);

  it('shows exactly four headline cards under a captioned heading', () => {
    render(<AtAGlance report={staffReport()} />);

    expect(screen.getByRole('heading', { name: 'At a glance' })).toBeTruthy();
    expect(screen.getByText(/The four numbers that matter most/)).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    for (const label of ['Revenue', 'Bookings', 'Occupancy', 'Average nightly rate']) {
      expect(screen.getByRole('heading', { name: label })).toBeTruthy();
    }
  });

  it('explains each number in one plain line and gives each a help icon', () => {
    render(<AtAGlance report={staffReport()} />);

    expect(screen.getByText(/Money you kept/)).toBeTruthy();
    expect(screen.getByText(/Confirmed bookings with at least one night/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What does Occupancy mean?' })).toBeTruthy();
  });

  it('writes the change in words next to the arrow, and "no earlier data" when there is none', () => {
    render(<AtAGlance report={staffReport({ netRevenueCents: 112000, previous: periodSummary({ netRevenueCents: 100000 }) })} />);
    expect(screen.getByText('▲ 12%')).toBeTruthy();
    expect(screen.getByText('12% higher than the previous period.')).toBeTruthy();

    cleanup();
    render(<AtAGlance report={staffReport({ previous: periodSummary({ reservationCount: 0, netRevenueCents: 0, occupancyPercent: 0, averageNightlyCents: 0 }) })} />);
    expect(screen.getAllByText('no earlier data')).toHaveLength(4);
  });
});
