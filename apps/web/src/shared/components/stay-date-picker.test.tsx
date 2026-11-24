// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/stay-date-picker.test.tsx
 * @shared Guest check-in picker disables past and booked days
 */

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOKED_DAY_CLASS, StayDatePicker } from './stay-date-picker';

interface HarnessProps {
  value?: string;
  onOpen?: () => void;
  onChange?: (isoDate: string) => void;
}

function Harness({ value = '2027-06-12', onOpen, onChange = (): void => undefined }: HarnessProps): React.JSX.Element {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <StayDatePicker
        label="Check-in"
        value={value}
        onChange={onChange}
        unavailable={[{ startDate: '2027-06-15', endDate: '2027-06-18' }]}
        todayIso="2027-06-10"
        {...(onOpen === undefined ? {} : { onOpen })}
      />
    </LocalizationProvider>
  );
}

async function openCalendar(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /choose date/i }));
}

function dayButton(day: string): HTMLElement {
  return screen.getByRole('gridcell', { name: day });
}

describe('StayDatePicker', (): void => {
  afterEach(cleanup);

  it('keeps the month the guest navigated to when the parent re-renders', async (): Promise<void> => {
    // Regression: the checkout form re-renders every second (hold countdown). A new value
    // object each render snapped the open calendar back to the selected month.
    const { rerender } = render(<Harness />);
    await openCalendar();
    expect(screen.getByText('June 2027')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByText('July 2027')).toBeTruthy();

    rerender(<Harness />);
    rerender(<Harness />);

    expect(screen.getByText('July 2027')).toBeTruthy();
  });

  it('disables booked nights', async (): Promise<void> => {
    render(<Harness />);
    await openCalendar();

    expect(dayButton('15')).toHaveProperty('disabled', true);
    expect(dayButton('16')).toHaveProperty('disabled', true);
    expect(dayButton('17')).toHaveProperty('disabled', true);
  });

  it('marks booked days with the slash style but not past days or the check-out day', async (): Promise<void> => {
    render(<Harness />);
    await openCalendar();

    for (const booked of ['15', '16', '17']) {
      expect(dayButton(booked).classList.contains(BOOKED_DAY_CLASS)).toBe(true);
    }
    // Past days are greyed out only, so "taken" reads differently from "gone".
    expect(dayButton('9').classList.contains(BOOKED_DAY_CLASS)).toBe(false);
    expect(dayButton('18').classList.contains(BOOKED_DAY_CLASS)).toBe(false);
    expect(dayButton('20').classList.contains(BOOKED_DAY_CLASS)).toBe(false);
  });

  it('keeps the check-out day of a booked stay pickable', async (): Promise<void> => {
    render(<Harness />);
    await openCalendar();

    expect(dayButton('18')).toHaveProperty('disabled', false);
  });

  it('disables days before today but not today', async (): Promise<void> => {
    render(<Harness />);
    await openCalendar();

    expect(dayButton('9')).toHaveProperty('disabled', true);
    expect(dayButton('10')).toHaveProperty('disabled', false);
  });

  it('reports the chosen day as YYYY-MM-DD', async (): Promise<void> => {
    const onChange = vi.fn<(isoDate: string) => void>();
    render(<Harness onChange={onChange} />);
    await openCalendar();

    await userEvent.click(dayButton('20'));

    expect(onChange).toHaveBeenCalledWith('2027-06-20');
  });

  it('does not pick a disabled day', async (): Promise<void> => {
    const onChange = vi.fn<(isoDate: string) => void>();
    render(<Harness onChange={onChange} />);
    await openCalendar();

    // userEvent refuses disabled days (pointer-events: none); a raw click is the stricter check.
    fireEvent.click(dayButton('16'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tells the caller when the calendar opens so booked dates can refresh', async (): Promise<void> => {
    const onOpen = vi.fn<() => void>();
    render(<Harness onOpen={onOpen} />);

    await openCalendar();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
