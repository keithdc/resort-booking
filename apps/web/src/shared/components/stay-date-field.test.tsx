// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/stay-date-field.test.tsx
 * @shared On-demand check-in field
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StayDateField } from './stay-date-field';

function renderField(value: string): void {
  render(
    <StayDateField
      label="Check-in"
      value={value}
      onChange={vi.fn<(isoDate: string) => void>()}
      unavailable={[]}
      todayIso="2027-06-10"
    />,
  );
}

describe('StayDateField', () => {
  afterEach(cleanup);

  it('holds the space with the chosen date while the picker loads, so the layout does not jump', () => {
    renderField('2027-07-10');

    const placeholder = screen.getByLabelText(/^Check-in/) as HTMLInputElement;
    expect(placeholder.value).toBe('10/07/2027');
    expect(placeholder.disabled).toBe(true);
  });

  it('shows an empty placeholder when no date is chosen yet', () => {
    renderField('');

    expect((screen.getByLabelText(/^Check-in/) as HTMLInputElement).value).toBe('');
  });

  it('swaps in the real date picker once it has loaded', async () => {
    renderField('2027-07-10');

    expect(await screen.findByRole('button', { name: /choose date/i })).toBeTruthy();
  });
});
