// @vitest-environment jsdom
/**
 * @file packages/ui/src/contact/email-field.test.tsx
 * @shared EmailField
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailField } from './email-field';

function Harness({ required = false, onValue }: { required?: boolean; onValue?: (value: string) => void }): React.JSX.Element {
  const [value, setValue] = useState('');
  return (
    <EmailField
      label="Email"
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
  return screen.getByLabelText(/^Email/);
}

describe('EmailField', () => {
  afterEach(cleanup);

  it('reports what is typed', async () => {
    const onValue = vi.fn<(value: string) => void>();
    render(<Harness onValue={onValue} />);

    await userEvent.type(input(), 'ada@example.com');

    expect(onValue).toHaveBeenLastCalledWith('ada@example.com');
  });

  it('does not scold while typing', async () => {
    render(<Harness />);

    await userEvent.type(input(), 'ada@');

    expect(screen.queryByText(/valid email/)).toBeNull();
  });

  it('explains a malformed address once the field is left', async () => {
    render(<Harness />);

    await userEvent.type(input(), 'ada@example');
    fireEvent.blur(input());

    expect(await screen.findByText('Enter a valid email address, like name@example.com')).toBeTruthy();
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });

  it('accepts a good address', async () => {
    render(<Harness />);

    await userEvent.type(input(), 'ada@example.com');
    fireEvent.blur(input());

    expect(screen.queryByText(/valid email/)).toBeNull();
  });

  it('asks for an address when required and left empty', () => {
    render(<Harness required />);

    fireEvent.blur(input());

    expect(screen.getByText('Enter an email address')).toBeTruthy();
  });

  it('leaves an optional empty field alone', () => {
    render(<Harness />);

    fireEvent.blur(input());

    expect(screen.queryByText(/email address/)).toBeNull();
  });

  it('uses the email keyboard and autocomplete hints', () => {
    render(<Harness />);

    expect(input().type).toBe('email');
    expect(input().getAttribute('autocomplete')).toBe('email');
  });

  it('floats the label when asked, even while empty (browser-filled sign-in fields)', () => {
    const { container, rerender } = render(<EmailField label="Email" value="" onChange={vi.fn()} shrinkLabel />);
    expect(container.querySelector('label.MuiInputLabel-shrink')).not.toBeNull();

    rerender(<EmailField label="Email" value="" onChange={vi.fn()} />);
    expect(container.querySelector('label.MuiInputLabel-shrink')).toBeNull();
  });
});
