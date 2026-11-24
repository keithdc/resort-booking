// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/properties-tab.test.tsx
 * @feature reporting
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReport } from '@/test/fixtures';
import { PropertiesTab } from './properties-tab';

describe('PropertiesTab', () => {
  afterEach(cleanup);

  it('shows the heading, its caption and one row per property with its stay count and share', () => {
    render(<PropertiesTab report={staffReport()} onOpenDetail={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Properties and stays' })).toBeTruthy();
    expect(screen.getByText(/How each property and each stay performed/)).toBeTruthy();
    expect(screen.getByText('Alpine Lake')).toBeTruthy();
    expect(screen.getByText('2 stays')).toBeTruthy();
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
  });

  it('expands a property to show its stays, including one nobody booked', () => {
    render(<PropertiesTab report={staffReport()} onOpenDetail={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: 'Show the stays of Alpine Lake' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide the stays of Alpine Lake' }).getAttribute('aria-expanded')).toBe('true');
    const stays = screen.getByRole('table', { name: 'Stays of Alpine Lake' });
    expect(within(stays).getByText('Lake Chalet')).toBeTruthy();
    expect(within(stays).getByText('Old Barn')).toBeTruthy();
  });

  it('sorts when a column heading is chosen, and flips the direction on a second choice', () => {
    const report = staffReport({
      properties: [
        { propertyId: 'p1', propertyName: 'Alpine Lake', reservationCount: 3, occupiedNights: 12, revenueCents: 60000, currencyCode: 'EUR', houseCount: 1, houses: [{ houseId: 'h1', houseName: 'Chalet', reservationCount: 3, occupiedNights: 12, revenueCents: 60000 }] },
        { propertyId: 'p2', propertyName: 'Atlantic Dune', reservationCount: 1, occupiedNights: 3, revenueCents: 40000, currencyCode: 'EUR', houseCount: 1, houses: [{ houseId: 'h3', houseName: 'Dune', reservationCount: 1, occupiedNights: 3, revenueCents: 40000 }] },
      ],
    });
    render(<PropertiesTab report={report} onOpenDetail={vi.fn()} />);
    const names = (): string[] => screen.getAllByRole('button', { name: /^(Alpine Lake|Atlantic Dune)$/ }).map((button) => button.textContent ?? '');

    expect(names()).toEqual(['Alpine Lake', 'Atlantic Dune']); // revenue, biggest first

    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));
    expect(names()).toEqual(['Atlantic Dune', 'Alpine Lake']);

    fireEvent.click(screen.getByRole('button', { name: 'Property / stay' }));
    expect(names()).toEqual(['Alpine Lake', 'Atlantic Dune']);
  });

  it('opens the bookings behind a property or a stay', () => {
    const onOpenDetail = vi.fn();
    render(<PropertiesTab report={staffReport()} onOpenDetail={onOpenDetail} />);

    fireEvent.click(screen.getByRole('button', { name: 'Alpine Lake' }));
    expect(onOpenDetail.mock.calls[0]?.[0]).toMatchObject({ title: 'Alpine Lake' });
    expect((onOpenDetail.mock.calls[0]?.[0] as { stays: unknown[] }).stays).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Show the stays of Alpine Lake' }));
    fireEvent.click(screen.getByRole('button', { name: 'Old Barn' }));
    expect((onOpenDetail.mock.calls[1]?.[0] as { stays: unknown[] }).stays).toHaveLength(1);
  });

  it('explains an empty table', () => {
    render(<PropertiesTab report={staffReport({ properties: [] })} onOpenDetail={vi.fn()} />);

    expect(screen.getByText(/No properties to show/)).toBeTruthy();
  });
});
