// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/occupancy-home-page.test.tsx
 * @feature reservations
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OccupancyHomePage } from './occupancy-home-page';

const properties = vi.hoisted(() => ({
  fetchStaffProperties: vi.fn<() => Promise<PropertySummary[]>>(),
}));

vi.mock('@/features/property/services/staff-property-api', () => properties);
vi.mock('@/features/refunds', () => ({ RefundsAlert: (): React.JSX.Element => <div>refunds alert</div> }));
vi.mock('./occupancy-calendar', () => ({ OccupancyCalendar: (): React.JSX.Element => <div>calendar</div> }));

describe('OccupancyHomePage', () => {
  afterEach(cleanup);

  it('shows the refunds heads-up above the calendar', async () => {
    properties.fetchStaffProperties.mockResolvedValue([]);

    const { container } = render(await OccupancyHomePage());

    expect(screen.getByText('refunds alert')).toBeTruthy();
    expect(screen.getByText('calendar')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text.indexOf('refunds alert')).toBeLessThan(text.indexOf('calendar'));
  });
});
