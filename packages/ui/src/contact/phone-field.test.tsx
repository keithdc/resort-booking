// @vitest-environment jsdom
/**
 * @file packages/ui/src/contact/phone-field.test.tsx
 * @shared PhoneField
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneField } from './phone-field';

interface HarnessProps {
  initial?: string;
  required?: boolean;
  onValue?: (value: string) => void;
}

/** Holds the value the way a real form does, and reports every change. */
function Harness({ initial = '', required = false, onValue }: HarnessProps): React.JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <PhoneField
      label="Phone"
      value={value}
      required={required}
      onChange={(next): void => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function input(): HTMLInputElement {
  return screen.getByLabelText(/^Phone/);
}

function countrySelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Country calling code' });
}

describe('PhoneField', () => {
  afterEach(cleanup);

  it('shows the default country flag and calling code', () => {
    render(<Harness />);

    expect(countrySelect().textContent).toBe('🇫🇷 +33');
  });

  it('reports a clean international number while the person types a national one', async () => {
    const onValue = vi.fn<(value: string) => void>();
    render(<Harness onValue={onValue} />);

    await userEvent.type(input(), '0612345678');

    expect(onValue).toHaveBeenLastCalledWith('+33612345678');
    expect(input().value).toBe('06 12 34 56 78');
  });

  it('reports empty when the field is cleared', async () => {
    const onValue = vi.fn<(value: string) => void>();
    render(<Harness initial="+33612345678" onValue={onValue} />);

    await userEvent.clear(input());

    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('pre-fills the country and national number from a saved value', () => {
    render(<Harness initial="+4930123456" />);

    expect(countrySelect().textContent).toBe('🇩🇪 +49');
    expect(input().value).toBe('030 123456');
  });

  it('switches country and keeps the digits already typed', async () => {
    const onValue = vi.fn<(value: string) => void>();
    render(<Harness onValue={onValue} />);
    await userEvent.type(input(), '30123456');

    await userEvent.click(countrySelect());
    await userEvent.click(await screen.findByRole('option', { name: /Germany/ }));

    expect(countrySelect().textContent).toBe('🇩🇪 +49');
    expect(onValue).toHaveBeenLastCalledWith('+4930123456');
  });

  it('lets people search the list by scrolling: it offers many countries with flags and codes', async () => {
    render(<Harness />);

    await userEvent.click(countrySelect());

    const options = await screen.findAllByRole('option');
    expect(options.length).toBeGreaterThan(200);
    expect(within(screen.getByRole('option', { name: /United Kingdom/ })).getByText(/\+44/)).toBeTruthy();
  });

  it('selects the right country when an international number is pasted', () => {
    const onValue = vi.fn<(value: string) => void>();
    render(<Harness onValue={onValue} />);

    fireEvent.change(input(), { target: { value: '+49 30 123456' } });

    expect(countrySelect().textContent).toBe('🇩🇪 +49');
    expect(onValue).toHaveBeenLastCalledWith('+4930123456');
  });

  it('does not scold while typing, only after the field is left', async () => {
    render(<Harness />);

    await userEvent.type(input(), '06 12');
    expect(screen.queryByText(/valid phone number/)).toBeNull();

    await userEvent.tab();
    await userEvent.tab();
    fireEvent.blur(input());

    expect(await screen.findByText('Enter a valid phone number')).toBeTruthy();
  });

  it('shows no error for a valid number', async () => {
    render(<Harness />);

    await userEvent.type(input(), '0612345678');
    fireEvent.blur(input());

    expect(screen.queryByText(/valid phone number/)).toBeNull();
    expect(input().getAttribute('aria-invalid')).toBe('false');
  });

  it('asks for a number when required and left empty', () => {
    render(<Harness required />);

    fireEvent.blur(input());

    expect(screen.getByText('Enter a phone number')).toBeTruthy();
  });

  it('leaves an optional empty field alone', () => {
    render(<Harness />);

    fireEvent.blur(input());

    expect(screen.queryByText(/phone number/)).toBeNull();
  });

  it('follows the parent when it loads a saved value later', () => {
    const { rerender } = render(<PhoneField label="Phone" value="" onChange={vi.fn<(value: string) => void>()} />);

    rerender(<PhoneField label="Phone" value="+442071838750" onChange={vi.fn<(value: string) => void>()} />);

    expect(countrySelect().textContent).toBe('🇬🇧 +44');
    expect(input().value).toBe('020 7183 8750');
  });

  it('disables both the number and the country when disabled', () => {
    render(<PhoneField label="Phone" value="" onChange={vi.fn<(value: string) => void>()} disabled />);

    expect(input().disabled).toBe(true);
    expect(countrySelect().getAttribute('aria-disabled')).toBe('true');
  });
});
