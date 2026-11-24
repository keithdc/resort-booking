// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/house-seasonal-rates-list.test.tsx
 * @feature property
 */

import type { RatePeriod } from '@resort-booking/shared-types';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HouseSeasonalRatesList } from './house-seasonal-rates-list';

function period(id: string, label: string, startDate: string, endDate: string, nightlyRateCents: number): RatePeriod {
  return { id, houseId: 'h1', propertyId: 'p1', label, startDate, endDate, nightlyRateCents };
}

describe('HouseSeasonalRatesList', () => {
  afterEach(cleanup);

  it('lists every season as its own list item with dates and rate', () => {
    render(
      <HouseSeasonalRatesList
        houseName="Lake Chalet"
        currencyCode="EUR"
        periods={[
          period('a', 'Winter holidays', '2026-12-23', '2027-01-03', 44800),
          period('b', 'Peak summer 2027', '2027-07-01', '2027-08-31', 41600),
        ]}
      />,
    );

    const items = within(screen.getByRole('list', { name: 'Seasonal rates for Lake Chalet' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Winter holidays');
    expect(items[0]?.textContent).toContain('23 Dec 2026 to 3 Jan 2027');
    expect(items[1]?.textContent?.replace(/\s/g, ' ')).toContain('416,00 € / night');
  });

  it('says so when a house has only the standard rate', () => {
    render(<HouseSeasonalRatesList houseName="Spruce Studio" currencyCode="EUR" periods={[]} />);

    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('No seasonal rates: standard rate all year')).toBeTruthy();
  });
});
