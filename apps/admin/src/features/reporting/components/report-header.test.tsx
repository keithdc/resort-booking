// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/report-header.test.tsx
 * @feature reporting
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportPeriod } from '../hooks/use-report-period';
import { ReportHeader } from './report-header';

function period(overrides: Partial<ReportPeriod> = {}): ReportPeriod {
  return {
    preset: 'this_month',
    setPreset: vi.fn(),
    firstDay: '',
    lastDay: '',
    setFirstDay: vi.fn(),
    setLastDay: vi.fn(),
    range: { from: '2027-07-01', to: '2027-08-01' },
    problem: null,
    ...overrides,
  };
}

const PROPERTIES = [{ id: 'p1', name: 'Alpine Lake' }, { id: 'p2', name: 'Atlantic Dune' }] as PropertySummary[];

function renderHeader(overrides: Partial<Parameters<typeof ReportHeader>[0]> = {}): Record<'onPropertyChange' | 'onDownload' | 'onPrint' | 'onRefresh', ReturnType<typeof vi.fn>> {
  const handlers = { onPropertyChange: vi.fn(), onDownload: vi.fn(), onPrint: vi.fn(), onRefresh: vi.fn() };
  render(<ReportHeader period={period()} properties={PROPERTIES} propertyId="" loading={false} canExport {...handlers} {...overrides} />);
  return handlers;
}

describe('ReportHeader', () => {
  afterEach(cleanup);

  it('shows the title, a plain intro and the five periods with the current one pressed', () => {
    renderHeader();

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy();
    expect(screen.getByText(/How your properties are doing/)).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Period' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['This month', 'Last month', 'Next 30 days', 'This year', 'Custom']);
    expect(within(group).getByRole('button', { name: 'This month' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('changes the period', () => {
    const chosen = period();
    renderHeader({ period: chosen });

    fireEvent.click(screen.getByRole('button', { name: 'Last month' }));

    expect(chosen.setPreset).toHaveBeenCalledWith('last_month');
  });

  it('keeps the current period when the pressed button is pressed again', () => {
    const chosen = period();
    renderHeader({ period: chosen });

    fireEvent.click(screen.getByRole('button', { name: 'This month' }));

    expect(chosen.setPreset).not.toHaveBeenCalled();
  });

  it('shows the custom days only for Custom, with the problem next to the last day', () => {
    renderHeader({ period: period({ preset: 'custom', problem: 'The last day cannot be before the first day.' }) });

    expect(screen.getByLabelText('First day')).toBeTruthy();
    expect(screen.getByText('The last day cannot be before the first day.')).toBeTruthy();
  });

  it('hides the custom days for the other periods', () => {
    renderHeader();

    expect(screen.queryByLabelText('First day')).toBeNull();
  });

  it('filters by property, with All properties as the start', () => {
    const { onPropertyChange } = renderHeader();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Property' }));
    fireEvent.click(screen.getByRole('option', { name: 'Atlantic Dune' }));

    expect(onPropertyChange).toHaveBeenCalledWith('p2');
  });

  it('downloads, prints and refreshes', () => {
    const { onDownload, onPrint, onRefresh } = renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables download and print without a report, and refresh while loading', () => {
    renderHeader({ canExport: false, loading: true });

    expect((screen.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Print / Save as PDF' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
